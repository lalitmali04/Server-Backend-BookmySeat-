import { seedDatabase } from '../src/db/seed.js';
import { db } from '../src/db/connection.js';
import { redisLockService } from '../src/services/redisLockService.js';
import { bookingService } from '../src/services/bookingService.js';
import { v4 as uuidv4 } from 'uuid';

async function runConcurrencyTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING BOOKMYSEAT CONCURRENCY & RACE-CONDITION TEST SUITE');
  console.log('====================================================\n');

  await seedDatabase();

  // Pick a sample show
  const showsRes = await db.query('SELECT * FROM shows LIMIT 1');
  const testShow = showsRes.rows[0];
  if (!testShow) {
    throw new Error('No shows found in database.');
  }

  const showId = testShow.id;
  const screenId = testShow.screen_id;
  const seatA1 = `${screenId}_A1`;
  const seatA2 = `${screenId}_A2`;
  const seatA3 = `${screenId}_A3`;
  const seatB1 = `${screenId}_B1`;
  const seatB2 = `${screenId}_B2`;

  // Reset test seats status to AVAILABLE for clean, idempotent test execution
  await db.query(
    "UPDATE show_seats SET status = 'AVAILABLE' WHERE show_id = $1 AND seat_id IN ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [showId, seatA1, seatA2, seatA3, seatB1, seatB2, `${screenId}_B3`, `${screenId}_B4`, `${screenId}_B5`, `${screenId}_B6`, `${screenId}_B7`]
  );

  // Clear any residual Redis locks for test seats from previous test runs
  const testSeatsList = [seatA1, seatA2, seatA3, seatB1, seatB2, `${screenId}_B3`, `${screenId}_B4`, `${screenId}_B5`, `${screenId}_B6`, `${screenId}_B7`];
  for (const sId of testSeatsList) {
    await redisLockService.forceReleaseSeatLock(showId, sId);
  }

  let passedCount = 0;
  let totalTests = 8;

  // ----------------------------------------------------
  // TEST 1: Two users attempt to lock the same seat simultaneously
  // ----------------------------------------------------
  console.log('👉 [Test 1/8] Concurrent seat locking: 2 users click seat A1 at the exact same millisecond...');
  const user1Token = 'session_user_1_' + uuidv4();
  const user2Token = 'session_user_2_' + uuidv4();

  const [lock1, lock2] = await Promise.all([
    redisLockService.acquireSeatLock(showId, seatA1, user1Token, 5),
    redisLockService.acquireSeatLock(showId, seatA1, user2Token, 5)
  ]);

  const test1Passed = (lock1.success && !lock2.success) || (!lock1.success && lock2.success);
  if (test1Passed) {
    console.log('   ✅ PASSED: Exactly one user acquired the temporary lock. The other received a lock collision error.\n');
    passedCount++;
  } else {
    console.error('   ❌ FAILED: Lock collision occurred or both failed.', { lock1, lock2 });
  }

  // ----------------------------------------------------
  // TEST 2: Lock expires after TTL
  // ----------------------------------------------------
  console.log('👉 [Test 2/8] TTL expiry: User 1 holds seat A2 with a 1-second TTL, then User 2 tries after expiration...');
  const test2Seat = seatA2;
  const userA = 'user_ttl_a_' + uuidv4();
  const userB = 'user_ttl_b_' + uuidv4();

  const initialLock = await redisLockService.acquireSeatLock(showId, test2Seat, userA, 1);
  if (!initialLock.success) throw new Error('Failed to acquire initial lock for test 2');

  console.log('   ⏳ Waiting 1.2s for TTL eviction...');
  await new Promise(r => setTimeout(r, 1200));

  const secondLock = await redisLockService.acquireSeatLock(showId, test2Seat, userB, 5);
  if (secondLock.success) {
    console.log('   ✅ PASSED: Expired lock was safely released and acquired by another user.\n');
    passedCount++;
  } else {
    console.error('   ❌ FAILED: Second user could not acquire seat after TTL expiration.');
  }

  // ----------------------------------------------------
  // TEST 3: Two users attempt final booking simultaneously for same seat
  // ----------------------------------------------------
  console.log('👉 [Test 3/8] Concurrent DB Booking: 2 users race to confirm booking on seat A3...');
  const test3Seat = seatA3;
  const tokenWinner = 'token_winner_' + uuidv4();
  const tokenLoser = 'token_loser_' + uuidv4();

  // User 1 locks seat A3
  await redisLockService.acquireSeatLock(showId, test3Seat, tokenWinner, 60);

  const bookingAttempts = await Promise.allSettled([
    bookingService.confirmBooking({
      userId: 'usr_demo',
      showId,
      seatIds: [test3Seat],
      userLockToken: tokenWinner,
      paymentMethod: 'UPI',
      idempotencyKey: 'idemp_race_1'
    }),
    bookingService.confirmBooking({
      userId: 'usr_jane',
      showId,
      seatIds: [test3Seat],
      userLockToken: tokenLoser,
      paymentMethod: 'CREDIT_CARD',
      idempotencyKey: 'idemp_race_2'
    })
  ]);

  const successBookings = bookingAttempts.filter(r => r.status === 'fulfilled');
  const rejectedBookings = bookingAttempts.filter(r => r.status === 'rejected');

  if (successBookings.length === 1 && rejectedBookings.length === 1) {
    console.log('   ✅ PASSED: Exactly 1 booking succeeded in database transaction. The unauthorized/race attempt was rejected.\n');
    passedCount++;
  } else {
    console.error('   ❌ FAILED:', { successBookings, rejectedBookings });
  }

  // ----------------------------------------------------
  // TEST 4: User tries to confirm booking without owning Redis lock
  // ----------------------------------------------------
  console.log('👉 [Test 4/8] Booking rejection without valid Redis lock ownership...');
  const unheldSeat = seatB1;
  const fakeToken = 'fake_token_unheld';

  try {
    await bookingService.confirmBooking({
      userId: 'usr_demo',
      showId,
      seatIds: [unheldSeat],
      userLockToken: fakeToken,
      paymentMethod: 'UPI'
    });
    console.error('   ❌ FAILED: Booking succeeded without lock ownership!');
  } catch (err: any) {
    if (err.status === 409 || err.status === 400 || (err.message && err.message.includes('expired'))) {
      console.log('   ✅ PASSED: Backend rejected booking because user does not hold Redis lock.\n');
      passedCount++;
    } else {
      console.error('   ❌ Unexpected error:', err);
    }
  }

  // ----------------------------------------------------
  // TEST 5: User lock expires before payment confirmation
  // ----------------------------------------------------
  console.log('👉 [Test 5/8] Booking rejection on expired lock during checkout delay...');
  const seatExp = seatB2;
  const expToken = 'token_exp_' + uuidv4();
  await redisLockService.acquireSeatLock(showId, seatExp, expToken, 1);

  console.log('   ⏳ Waiting 1.2s for lock expiration...');
  await new Promise(r => setTimeout(r, 1200));

  try {
    await bookingService.confirmBooking({
      userId: 'usr_demo',
      showId,
      seatIds: [seatExp],
      userLockToken: expToken,
      paymentMethod: 'UPI'
    });
    console.error('   ❌ FAILED: Booking was accepted on expired lock!');
  } catch (err: any) {
    console.log('   ✅ PASSED: Booking safely rejected when user confirmation arrived after TTL.\n');
    passedCount++;
  }

  // ----------------------------------------------------
  // TEST 6: User double-clicks Pay (Idempotency key)
  // ----------------------------------------------------
  console.log('👉 [Test 6/8] Idempotency: Double-clicking Pay with identical idempotency_key...');
  const doubleClickSeat = `${screenId}_B3`;
  const doubleToken = 'token_double_' + uuidv4();
  const idempotencyKey = 'idemp_key_double_click_' + uuidv4();

  await redisLockService.acquireSeatLock(showId, doubleClickSeat, doubleToken, 60);

  const [click1, click2] = await Promise.all([
    bookingService.confirmBooking({
      userId: 'usr_demo',
      showId,
      seatIds: [doubleClickSeat],
      userLockToken: doubleToken,
      paymentMethod: 'UPI',
      idempotencyKey
    }),
    bookingService.confirmBooking({
      userId: 'usr_demo',
      showId,
      seatIds: [doubleClickSeat],
      userLockToken: doubleToken,
      paymentMethod: 'UPI',
      idempotencyKey
    })
  ]);

  if (click1.booking_reference === click2.booking_reference) {
    console.log('   ✅ PASSED: Double click handled seamlessly; identical booking reference returned without duplicate charge.\n');
    passedCount++;
  } else {
    console.error('   ❌ FAILED: Duplicate bookings generated!', { click1, click2 });
  }

  // ----------------------------------------------------
  // TEST 7: Two users book different seats simultaneously
  // ----------------------------------------------------
  console.log('👉 [Test 7/8] Concurrent distinct bookings: User 1 books B4, User 2 books B5 simultaneously...');
  const seatB4 = `${screenId}_B4`;
  const seatB5 = `${screenId}_B5`;
  const tokenB4 = 'token_b4_' + uuidv4();
  const tokenB5 = 'token_b5_' + uuidv4();

  await redisLockService.acquireSeatLock(showId, seatB4, tokenB4, 60);
  await redisLockService.acquireSeatLock(showId, seatB5, tokenB5, 60);

  const [bkgRes1, bkgRes2] = await Promise.all([
    bookingService.confirmBooking({
      userId: 'usr_demo',
      showId,
      seatIds: [seatB4],
      userLockToken: tokenB4,
      paymentMethod: 'NET_BANKING',
      idempotencyKey: 'idemp_b4_' + uuidv4()
    }),
    bookingService.confirmBooking({
      userId: 'usr_jane',
      showId,
      seatIds: [seatB5],
      userLockToken: tokenB5,
      paymentMethod: 'UPI',
      idempotencyKey: 'idemp_b5_' + uuidv4()
    })
  ]);

  if (bkgRes1.status === 'CONFIRMED' && bkgRes2.status === 'CONFIRMED' && bkgRes1.id !== bkgRes2.id) {
    console.log('   ✅ PASSED: Both distinct concurrent bookings succeeded in parallel.\n');
    passedCount++;
  } else {
    console.error('   ❌ FAILED:', { bkgRes1, bkgRes2 });
  }

  // ----------------------------------------------------
  // TEST 8: Multi-seat booking with partial unavailability (Atomic Rollback)
  // ----------------------------------------------------
  console.log('👉 [Test 8/8] Multi-seat atomic rollback: User tries to lock [B6, B7], but B7 is already locked by someone else...');
  const seatB6 = `${screenId}_B6`;
  const seatB7 = `${screenId}_B7`;
  const otherUserToken = 'token_other_' + uuidv4();
  const myMultiToken = 'token_my_multi_' + uuidv4();

  // Other user holds B7
  await redisLockService.acquireSeatLock(showId, seatB7, otherUserToken, 60);

  const multiLockRes = await redisLockService.acquireMultipleSeatLocks(
    showId,
    [seatB6, seatB7],
    myMultiToken,
    60
  );

  // Check if B6 was rolled back and is NOT held by myMultiToken
  const b6Status = await redisLockService.verifySeatLocksOwnership(showId, [seatB6], myMultiToken);

  if (!multiLockRes.success && !b6Status.valid) {
    console.log('   ✅ PASSED: Multi-seat batch locked atomic rollback: No partial seats were held.\n');
    passedCount++;
  } else {
    console.error('   ❌ FAILED: Partial lock remained!', { multiLockRes, b6Status });
  }

  console.log('====================================================');
  console.log(`🎉 CONCURRENCY TEST SUMMARY: ${passedCount} / ${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (passedCount === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runConcurrencyTests().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
