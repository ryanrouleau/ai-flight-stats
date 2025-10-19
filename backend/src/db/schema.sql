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
  departure_time_local TEXT,
  arrival_time_local TEXT,
  departure_airport TEXT NOT NULL,
  arrival_airport TEXT NOT NULL,
  departure_city TEXT,
  arrival_city TEXT,
  airline TEXT,
  flight_number TEXT,
  cabin TEXT,
  passenger_names TEXT,
  notes TEXT,
  departure_lat REAL,
  departure_lng REAL,
  arrival_lat REAL,
  arrival_lng REAL,
  raw_email_snippet TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_email) REFERENCES users(email)
);
