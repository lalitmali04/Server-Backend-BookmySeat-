import bcrypt from 'bcryptjs';
import { db } from './connection.js';
import { v4 as uuidv4 } from 'uuid';

export async function seedDatabase() {
  console.log('🌱 Seeding BookMySeat demo database...');

  // 1. Clean / Init tables if needed
  const passwordHash = await bcrypt.hash('User@123', 10);
  const adminPasswordHash = await bcrypt.hash('Admin@123', 10);

  // USERS
  const users = [
    {
      id: 'usr_admin',
      name: 'System Administrator',
      email: 'admin@bookmyseat.com',
      password_hash: adminPasswordHash,
      role: 'admin',
      phone: '+91 9876543210',
      created_at: new Date().toISOString()
    },
    {
      id: 'usr_demo',
      name: 'Alex Johnson',
      email: 'user@bookmyseat.com',
      password_hash: passwordHash,
      role: 'user',
      phone: '+91 9123456780',
      created_at: new Date().toISOString()
    },
    {
      id: 'usr_jane',
      name: 'Jane Smith',
      email: 'jane@example.com',
      password_hash: passwordHash,
      role: 'user',
      phone: '+91 9988776655',
      created_at: new Date().toISOString()
    }
  ];

  for (const u of users) {
    try {
      await db.query(
        `INSERT INTO users (id, name, email, password_hash, role, phone, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [u.id, u.name, u.email, u.password_hash, u.role, u.phone, u.created_at]
      );
    } catch (e) {}
  }

  // MOVIES & LIVE EVENTS
  const movies = [
    {
      id: 'mov_dune3',
      title: 'Dune: Part Three - Messiah',
      poster_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop',
      backdrop_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1600&auto=format&fit=crop',
      trailer_url: 'https://www.youtube.com/watch?v=Way9Dexny3w',
      rating: 9.4,
      votes: 48200,
      duration: '2h 45m',
      release_date: '2026-09-18',
      language: 'English',
      genres: ['Sci-Fi', 'Adventure', 'Drama'],
      description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family, facing a fateful choice between love and the destiny of the universe.',
      cast_list: [
        { name: 'Timothée Chalamet', role: 'Paul Atreides', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop' },
        { name: 'Zendaya', role: 'Chani', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop' },
        { name: 'Florence Pugh', role: 'Princess Irulan', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop' },
        { name: 'Austin Butler', role: 'Feyd-Rautha', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop' }
      ],
      director: 'Denis Villeneuve',
      is_trending: true,
      is_now_showing: true,
      is_upcoming: false,
      category: 'movie'
    },
    {
      id: 'mov_interstellar_re',
      title: 'Interstellar: 12th Anniversary IMAX',
      poster_url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=800&auto=format&fit=crop',
      backdrop_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1600&auto=format&fit=crop',
      trailer_url: 'https://www.youtube.com/watch?v=zSWdZVtXT7E',
      rating: 9.6,
      votes: 125000,
      duration: '2h 49m',
      release_date: '2026-09-10',
      language: 'English',
      genres: ['Sci-Fi', 'Drama', 'Adventure'],
      description: 'When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft, along with a team of researchers, to find a new planet for humans.',
      cast_list: [
        { name: 'Matthew McConaughey', role: 'Joseph Cooper', image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop' },
        { name: 'Anne Hathaway', role: 'Dr. Amelia Brand', image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop' },
        { name: 'Jessica Chastain', role: 'Murph Cooper', image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop' }
      ],
      director: 'Christopher Nolan',
      is_trending: true,
      is_now_showing: true,
      is_upcoming: false,
      category: 'movie'
    },
    {
      id: 'mov_avengers_secret',
      title: 'Avengers: Secret Wars',
      poster_url: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=800&auto=format&fit=crop',
      backdrop_url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=1600&auto=format&fit=crop',
      trailer_url: 'https://www.youtube.com/watch?v=TcMBFSGVi1c',
      rating: 9.1,
      votes: 34100,
      duration: '3h 10m',
      release_date: '2026-09-25',
      language: 'English',
      genres: ['Action', 'Sci-Fi', 'Superhero'],
      description: 'The multiverse collapses into Battleworld as heroes from across multiple timelines unite to face the greatest cosmic threat ever known in the Marvel Universe.',
      cast_list: [
        { name: 'Robert Downey Jr.', role: 'Doctor Doom', image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=200&auto=format&fit=crop' },
        { name: 'Benedict Cumberbatch', role: 'Doctor Strange', image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=200&auto=format&fit=crop' },
        { name: 'Tom Holland', role: 'Spider-Man', image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=200&auto=format&fit=crop' }
      ],
      director: 'Anthony & Joe Russo',
      is_trending: true,
      is_now_showing: true,
      is_upcoming: false,
      category: 'movie'
    },
    {
      id: 'mov_cyberpunk_neon',
      title: 'Cyberpunk: Neon Horizon',
      poster_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=800&auto=format&fit=crop',
      backdrop_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1600&auto=format&fit=crop',
      trailer_url: 'https://www.youtube.com/watch?v=8X2kIfS6fb8',
      rating: 8.8,
      votes: 18900,
      duration: '2h 15m',
      release_date: '2026-09-12',
      language: 'English',
      genres: ['Action', 'Thriller', 'Cyberpunk'],
      description: 'In a dystopian mega-city ruled by rogue artificial intelligence, an augmented underground syndicate takes the ultimate risk to liberate humanity.',
      cast_list: [
        { name: 'Keanu Reeves', role: 'Silas Vance', image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?q=80&w=200&auto=format&fit=crop' },
        { name: 'Ana de Armas', role: 'Kira 07', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop' }
      ],
      director: 'Alex Garland',
      is_trending: false,
      is_now_showing: true,
      is_upcoming: false,
      category: 'movie'
    },
    {
      id: 'mov_coldplay_tour',
      title: 'Coldplay: Music of the Spheres Live 2026',
      poster_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=800&auto=format&fit=crop',
      backdrop_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1600&auto=format&fit=crop',
      trailer_url: 'https://www.youtube.com/watch?v=k4V3Ui6pcEF',
      rating: 9.8,
      votes: 56000,
      duration: '3h 00m',
      release_date: '2026-10-02',
      language: 'English',
      genres: ['Concert', 'Music', 'Live Event'],
      description: 'Experience the electric, mesmerizing live concert broadcast of Coldplay’s world tour with immersive spatial audio and synchronized LED wristband spectacle.',
      cast_list: [
        { name: 'Chris Martin', role: 'Lead Vocalist', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop' },
        { name: 'Jonny Buckland', role: 'Lead Guitar', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop' }
      ],
      director: 'Paul Dugdale',
      is_trending: true,
      is_now_showing: true,
      is_upcoming: false,
      category: 'event'
    },
    {
      id: 'mov_standup_night',
      title: 'Zakir Khan & Friends: Live Special Arena',
      poster_url: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?q=80&w=800&auto=format&fit=crop',
      backdrop_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=1600&auto=format&fit=crop',
      trailer_url: 'https://www.youtube.com/watch?v=example',
      rating: 9.2,
      votes: 21300,
      duration: '2h 30m',
      release_date: '2026-09-30',
      language: 'Hindi',
      genres: ['Comedy', 'Live Event'],
      description: 'India’s biggest standup comedy sensation brings brand-new relatable anecdotes, poetic punchlines, and gut-busting humor live in a stadium experience.',
      cast_list: [
        { name: 'Zakir Khan', role: 'Comedian', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop' }
      ],
      director: 'Zakir Khan',
      is_trending: false,
      is_now_showing: true,
      is_upcoming: false,
      category: 'event'
    },
    {
      id: 'mov_avatar_fire',
      title: 'Avatar: Fire and Ash',
      poster_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
      backdrop_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1600&auto=format&fit=crop',
      trailer_url: 'https://www.youtube.com/watch?v=d9MyW72ELq0',
      rating: 9.5,
      votes: 89000,
      duration: '3h 15m',
      release_date: '2026-12-18',
      language: 'English',
      genres: ['Sci-Fi', 'Action', 'Fantasy'],
      description: 'Jake Sully and Neytiri encounter the Ash People, a fiery and volatile clan of Na\'vi residing in the volcanic regions of Pandora.',
      cast_list: [
        { name: 'Sam Worthington', role: 'Jake Sully', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop' },
        { name: 'Zoe Saldana', role: 'Neytiri', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop' }
      ],
      director: 'James Cameron',
      is_trending: true,
      is_now_showing: false,
      is_upcoming: true,
      category: 'movie'
    },
    {
      id: 'mov_batman_part2',
      title: 'The Batman: Part II',
      poster_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=800&auto=format&fit=crop',
      backdrop_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
      trailer_url: 'https://www.youtube.com/watch?v=mqqft2x_Aa4',
      rating: 9.3,
      votes: 42000,
      duration: '2h 55m',
      release_date: '2026-10-15',
      language: 'English',
      genres: ['Action', 'Crime', 'Mystery'],
      description: 'Bruce Wayne delves deeper into the corrupted underworld of Gotham City as the Court of Owls emerges from the shadows.',
      cast_list: [
        { name: 'Robert Pattinson', role: 'Bruce Wayne / Batman', image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=200&auto=format&fit=crop' },
        { name: 'Colin Farrell', role: 'Oswald Cobblepot', image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop' }
      ],
      director: 'Matt Reeves',
      is_trending: true,
      is_now_showing: false,
      is_upcoming: true,
      category: 'movie'
    }
  ];

  for (const m of movies) {
    try {
      await db.query(
        `INSERT INTO movies (id, title, poster_url, backdrop_url, trailer_url, rating, votes, duration, release_date, language, genres, description, cast_list, director, is_trending, is_now_showing, is_upcoming, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          m.id,
          m.title,
          m.poster_url,
          m.backdrop_url,
          m.trailer_url,
          m.rating,
          m.votes,
          m.duration,
          m.release_date,
          m.language,
          m.genres,
          m.description,
          m.cast_list,
          m.director,
          m.is_trending,
          m.is_now_showing,
          m.is_upcoming,
          m.category
        ]
      );
    } catch (e) {}
  }

  // THEATRES
  const theatres = [
    {
      id: 'th_pvr_imax',
      name: 'PVR ICON Gold & IMAX 3D',
      city: 'Mumbai',
      address: 'Phoenix Palladium Mall, High Street Phoenix, Lower Parel, Mumbai',
      rating: 4.8,
      facilities: ['Dolby Atmos', '4K Laser IMAX', 'Gourmet Food Hall', 'Valet Parking', 'Recliner Lounges']
    },
    {
      id: 'th_inox_megaplex',
      name: 'INOX Megaplex Laser & INSIGNIA',
      city: 'Mumbai',
      address: 'Inorbit Mall, Link Road, Malad West, Mumbai',
      rating: 4.7,
      facilities: ['INSIGNIA VIP', 'Dolby Atmos', 'Food Court', 'Wheelchair Access']
    },
    {
      id: 'th_cinepolis_forum',
      name: 'Cinépolis IMAX & VIP Lounge',
      city: 'Bengaluru',
      address: 'Nexus Forum Mall, Koramangala 7th Block, Bengaluru',
      rating: 4.9,
      facilities: ['RealD 3D', 'VIP Butler Service', 'Dolby Atmos 7.1', 'Gaming Arena']
    },
    {
      id: 'th_pvr_delhi',
      name: 'PVR Director’s Cut & 4DX',
      city: 'Delhi NCR',
      address: 'Ambience Mall, Nelson Mandela Marg, Vasant Kunj, New Delhi',
      rating: 4.9,
      facilities: ['4DX Motion Seats', 'Luxury Recliners', 'Chef Special Menu', 'Valet']
    },
    {
      id: 'th_prasads_hyd',
      name: 'Prasads Multiplex Large Screen',
      city: 'Hyderabad',
      address: 'NTR Gardens, Necklace Road, Hussain Sagar, Hyderabad',
      rating: 4.8,
      facilities: ['Dual 4K Laser', 'Dolby 64-Channel Atmos', 'Food Arena', 'EV Charging']
    }
  ];

  for (const t of theatres) {
    try {
      await db.query(
        `INSERT INTO theatres (id, name, city, address, rating, facilities)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [t.id, t.name, t.city, t.address, t.rating, t.facilities]
      );
    } catch (e) {}
  }

  // SCREENS & SEATS
  const screens = [
    { id: 'scr_mumbai_1', theatre_id: 'th_pvr_imax', name: 'Audi 1 - IMAX Laser', format: 'IMAX 3D', total_seats: 80 },
    { id: 'scr_mumbai_2', theatre_id: 'th_pvr_imax', name: 'Audi 2 - Dolby Atmos', format: 'Dolby Atmos', total_seats: 80 },
    { id: 'scr_inox_1', theatre_id: 'th_inox_megaplex', name: 'Screen 1 - INSIGNIA', format: 'INSIGNIA VIP', total_seats: 80 },
    { id: 'scr_blr_1', theatre_id: 'th_cinepolis_forum', name: 'Audi 1 - IMAX', format: 'IMAX 3D', total_seats: 80 },
    { id: 'scr_delhi_1', theatre_id: 'th_pvr_delhi', name: 'Audi 1 - 4DX', format: '4DX', total_seats: 80 },
    { id: 'scr_hyd_1', theatre_id: 'th_prasads_hyd', name: 'Screen 1 - Giant Screen', format: 'IMAX 3D', total_seats: 80 }
  ];

  for (const s of screens) {
    try {
      await db.query(
        `INSERT INTO screens (id, theatre_id, name, format, total_seats)
         VALUES ($1, $2, $3, $4, $5)`,
        [s.id, s.theatre_id, s.name, s.format, s.total_seats]
      );
    } catch (e) {}

    // Generate physical seats template for each screen (8 rows A-H, 10 seats per row = 80 seats)
    // Row A, B: RECLINER (Luxury)
    // Row C, D, E: PRIME (Premium)
    // Row F, G, H: CLASSIC (Standard)
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (const r of rows) {
      const category = (r === 'A' || r === 'B') ? 'RECLINER' : (r === 'C' || r === 'D' || r === 'E') ? 'PRIME' : 'CLASSIC';
      for (let num = 1; num <= 10; num++) {
        const seatId = `${s.id}_${r}${num}`;
        try {
          await db.query(
            `INSERT INTO seats (id, screen_id, row_label, seat_number, category, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [seatId, s.id, r, num, category, true]
          );
        } catch (e) {}
      }
    }
  }

  // SHOWTIMES (Today & upcoming dates)
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const dayAfter = new Date(Date.now() + 172800000).toISOString().split('T')[0];
  const dates = [today, tomorrow, dayAfter];

  const showTimesList = [
    { start: '10:00 AM', end: '12:45 PM' },
    { start: '01:30 PM', end: '04:15 PM' },
    { start: '04:45 PM', end: '07:30 PM' },
    { start: '08:00 PM', end: '10:45 PM' },
    { start: '11:15 PM', end: '02:00 AM' }
  ];

  const shows = [];
  let showCounter = 1;

  for (const date of dates) {
    for (const movie of movies.slice(0, 5)) {
      for (const scr of screens.slice(0, 4)) {
        for (let idx = 0; idx < 3; idx++) {
          const timeSlot = showTimesList[idx];
          const showId = `show_${movie.id}_${scr.id}_${date}_${idx + 1}`;
          shows.push({
            id: showId,
            movie_id: movie.id,
            screen_id: scr.id,
            theatre_id: scr.theatre_id,
            start_time: timeSlot.start,
            end_time: timeSlot.end,
            date: date,
            language: movie.language,
            format: scr.format
          });
        }
      }
    }
  }

  for (const sh of shows) {
    try {
      await db.query(
        `INSERT INTO shows (id, movie_id, screen_id, theatre_id, start_time, end_time, date, language, format)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [sh.id, sh.movie_id, sh.screen_id, sh.theatre_id, sh.start_time, sh.end_time, sh.date, sh.language, sh.format]
      );
    } catch (e) {}

    // Populate show_seats for each show
    const seatsRes = await db.query('SELECT * FROM seats WHERE screen_id = $1', [sh.screen_id]);
    for (const seat of seatsRes.rows) {
      const showSeatId = `${sh.id}_${seat.row_label}${seat.seat_number}`;
      const price = seat.category === 'RECLINER' ? 450 : seat.category === 'PRIME' ? 280 : 180;
      
      // Mark a couple of sample booked seats (e.g. C5, C6) for realism
      const isPreBooked = (seat.row_label === 'C' && (seat.seat_number === 4 || seat.seat_number === 5)) ||
                          (seat.row_label === 'E' && (seat.seat_number === 7 || seat.seat_number === 8));

      try {
        await db.query(
          `INSERT INTO show_seats (id, show_id, seat_id, category, price, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [showSeatId, sh.id, seat.id, seat.category, price, isPreBooked ? 'BOOKED' : 'AVAILABLE']
        );
      } catch (e) {}
    }
  }

  // Sample confirmed booking for demo user
  const demoShow = shows[0];
  if (demoShow) {
    const bookingId = 'bkg_demo_welcome';
    const bookingRef = 'BMS-84920471';
    const finalAmount = 616; // (280*2) + 40 + 16
    try {
      await db.query(
        `INSERT INTO bookings (id, booking_reference, user_id, show_id, total_amount, convenience_fee, tax, final_amount, status, payment_status, payment_id, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          bookingId,
          bookingRef,
          'usr_demo',
          demoShow.id,
          560,
          40,
          16,
          finalAmount,
          'CONFIRMED',
          'COMPLETED',
          'PAY-WELCOME77',
          'idemp_demo_welcome',
          new Date().toISOString()
        ]
      );

      await db.query(
        `INSERT INTO booking_items (id, booking_id, show_seat_id, seat_label, price, category)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['item_1', bookingId, `${demoShow.screen_id}_C4`, 'C4', 280, 'PRIME']
      );
      await db.query(
        `INSERT INTO booking_items (id, booking_id, show_seat_id, seat_label, price, category)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['item_2', bookingId, `${demoShow.screen_id}_C5`, 'C5', 280, 'PRIME']
      );

      await db.query(
        `INSERT INTO payments (id, booking_id, user_id, amount, payment_method, status, transaction_ref, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['pmt_demo', bookingId, 'usr_demo', finalAmount, 'UPI', 'SUCCESS', 'TXN-WELCOME77', new Date().toISOString()]
      );
    } catch (e) {}
  }

  console.log('✅ Seed completed successfully: Users, Movies, Theatres, Screens, Seats & Shows are live!');
}
