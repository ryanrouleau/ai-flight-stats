-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  google_access_token TEXT,
  google_refresh_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Flights table
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  confirmation_number TEXT,
  flight_date DATE NOT NULL,
  departure_airport TEXT NOT NULL,
  arrival_airport TEXT NOT NULL,
  departure_city TEXT,
  arrival_city TEXT,
  airline TEXT,
  flight_number TEXT,
  departure_lat REAL,
  departure_lng REAL,
  arrival_lat REAL,
  arrival_lng REAL,
  raw_email_snippet TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_email) REFERENCES users(email)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_flights_user_email ON flights(user_email);
CREATE INDEX IF NOT EXISTS idx_flights_date ON flights(flight_date);
CREATE INDEX IF NOT EXISTS idx_flights_airports ON flights(departure_airport, arrival_airport);
