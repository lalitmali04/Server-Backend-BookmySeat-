-- BookMySeat Production Relational Database Schema (PostgreSQL)

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) DEFAULT 'user' NOT NULL, -- 'user' | 'admin'
    phone VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. MOVIES / EVENTS
CREATE TABLE IF NOT EXISTS movies (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    poster_url TEXT NOT NULL,
    backdrop_url TEXT NOT NULL,
    trailer_url TEXT NOT NULL,
    rating NUMERIC(3,1) DEFAULT 0.0,
    votes INTEGER DEFAULT 0,
    duration VARCHAR(64) NOT NULL,
    release_date VARCHAR(64) NOT NULL,
    language VARCHAR(64) NOT NULL,
    genres TEXT[] NOT NULL,
    description TEXT NOT NULL,
    cast_list JSONB NOT NULL,
    director VARCHAR(255) NOT NULL,
    is_trending BOOLEAN DEFAULT false,
    is_now_showing BOOLEAN DEFAULT true,
    is_upcoming BOOLEAN DEFAULT false,
    category VARCHAR(32) DEFAULT 'movie', -- 'movie' | 'event'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. THEATRES / VENUES
CREATE TABLE IF NOT EXISTS theatres (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    rating NUMERIC(3,1) DEFAULT 4.5,
    facilities TEXT[] DEFAULT ARRAY['Food Court', 'Dolby Atmos', 'Wheelchair Accessible', 'Parking'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. SCREENS
CREATE TABLE IF NOT EXISTS screens (
    id VARCHAR(64) PRIMARY KEY,
    theatre_id VARCHAR(64) NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    format VARCHAR(64) DEFAULT 'IMAX 3D', -- '2D', '3D', 'IMAX 3D', '4DX', 'INSIGNIA'
    total_seats INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. SEATS TEMPLATE (Physical seats per screen)
CREATE TABLE IF NOT EXISTS seats (
    id VARCHAR(64) PRIMARY KEY,
    screen_id VARCHAR(64) NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    row_label VARCHAR(8) NOT NULL,
    seat_number INTEGER NOT NULL,
    category VARCHAR(32) NOT NULL, -- 'RECLINER', 'PRIME', 'CLASSIC'
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT unique_screen_seat UNIQUE (screen_id, row_label, seat_number)
);

-- 6. SHOWS / SCREENINGS
CREATE TABLE IF NOT EXISTS shows (
    id VARCHAR(64) PRIMARY KEY,
    movie_id VARCHAR(64) NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    screen_id VARCHAR(64) NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    theatre_id VARCHAR(64) NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
    start_time VARCHAR(32) NOT NULL,
    end_time VARCHAR(32) NOT NULL,
    date VARCHAR(32) NOT NULL, -- 'YYYY-MM-DD'
    language VARCHAR(64) NOT NULL,
    format VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. SHOW SEATS (Availability and dynamic price per show)
CREATE TABLE IF NOT EXISTS show_seats (
    id VARCHAR(64) PRIMARY KEY,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    seat_id VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    status VARCHAR(32) DEFAULT 'AVAILABLE' NOT NULL, -- 'AVAILABLE', 'LOCKED', 'BOOKED'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_show_seat UNIQUE (show_id, seat_id)
);

-- Index on show_seats for ultra-fast availability lookups & locking
CREATE INDEX IF NOT EXISTS idx_show_seats_show_status ON show_seats(show_id, status);

-- 8. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
    id VARCHAR(64) PRIMARY KEY,
    booking_reference VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id),
    total_amount NUMERIC(10,2) NOT NULL,
    convenience_fee NUMERIC(10,2) NOT NULL,
    tax NUMERIC(10,2) NOT NULL,
    final_amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(32) DEFAULT 'CONFIRMED' NOT NULL, -- 'CONFIRMED', 'CANCELLED', 'PENDING'
    payment_status VARCHAR(32) DEFAULT 'COMPLETED' NOT NULL,
    payment_id VARCHAR(128),
    idempotency_key VARCHAR(128) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_show_id ON bookings(show_id);

-- 9. BOOKING ITEMS (Seats in each booking)
CREATE TABLE IF NOT EXISTS booking_items (
    id VARCHAR(64) PRIMARY KEY,
    booking_id VARCHAR(64) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    show_seat_id VARCHAR(64) NOT NULL,
    seat_label VARCHAR(16) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    category VARCHAR(32) NOT NULL
);

-- 10. PAYMENTS (Audit log of mock transactions)
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    booking_id VARCHAR(64) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    amount NUMERIC(10,2) NOT NULL,
    payment_method VARCHAR(64) NOT NULL, -- 'UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'NET_BANKING', 'WALLET'
    status VARCHAR(32) DEFAULT 'SUCCESS' NOT NULL,
    transaction_ref VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
