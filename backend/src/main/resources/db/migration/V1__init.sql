-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id BIGSERIAL PRIMARY KEY,
    number VARCHAR(10) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL,
    capacity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    floor INTEGER NOT NULL,
    description TEXT,
    amenities TEXT,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT valid_room_status CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'OUT_OF_ORDER'))
);

CREATE INDEX idx_room_status ON rooms(status);
CREATE INDEX idx_room_type ON rooms(type);

-- Guests table
CREATE TABLE IF NOT EXISTS guests (
    id BIGSERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- Rates table
CREATE TABLE IF NOT EXISTS rates (
    id BIGSERIAL PRIMARY KEY,
    room_type VARCHAR(20) NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    seasonal_modifier DECIMAL(5, 2) NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id BIGSERIAL PRIMARY KEY,
    booking_reference VARCHAR(20) NOT NULL UNIQUE,
    room_id BIGINT NOT NULL,
    guest_name VARCHAR(100) NOT NULL,
    guest_email VARCHAR(100) NOT NULL,
    guest_phone VARCHAR(20),
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    guests INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    special_requests TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    CONSTRAINT fk_booking_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT valid_booking_status CHECK (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'REJECTED')),
    CONSTRAINT valid_dates CHECK (check_out_date > check_in_date)
);

CREATE INDEX idx_booking_dates ON bookings(check_in_date, check_out_date);
CREATE INDEX idx_booking_status ON bookings(status);
CREATE INDEX idx_booking_reference ON bookings(booking_reference);

-- Insert sample data
INSERT INTO rooms (number, type, capacity, price, floor, amenities) VALUES
('101', 'SINGLE', 1, 99.99, 1, 'TV, WiFi'),
('102', 'DOUBLE', 2, 149.99, 1, 'TV, WiFi, Mini-bar'),
('201', 'SUITE', 4, 299.99, 2, 'TV, WiFi, Mini-bar, Balcony');

INSERT INTO rates (room_type, base_price, seasonal_modifier, valid_from, valid_to) VALUES
('SINGLE', 99.99, 1.0, '2024-01-01', '2024-12-31'),
('DOUBLE', 149.99, 1.0, '2024-01-01', '2024-12-31'),
('SUITE', 299.99, 1.2, '2024-06-01', '2024-08-31');