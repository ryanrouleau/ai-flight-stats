import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite');

// Initialize database connection
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better performance

console.log(`📁 Database connected: ${DB_PATH}`);

// Initialize schema
export function initializeDatabase(): void {
  const schemaPath = path.join(__dirname, '../db/schema.sql');

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('✅ Database schema initialized');
  } else {
    console.warn('⚠️  Schema file not found, creating tables inline');
    createTables();
  }
}

// Create tables inline if schema.sql doesn't exist
function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      google_access_token TEXT,
      google_refresh_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
  `);
  console.log('✅ Tables created');
}

// User operations
export interface User {
  id?: number;
  email: string;
  google_access_token?: string;
  google_refresh_token?: string;
  created_at?: string;
  updated_at?: string;
}

export function createUser(user: User): User {
  const stmt = db.prepare(`
    INSERT INTO users (email, google_access_token, google_refresh_token)
    VALUES (?, ?, ?)
  `);

  const result = stmt.run(
    user.email,
    user.google_access_token || null,
    user.google_refresh_token || null
  );

  return getUserById(result.lastInsertRowid as number)!;
}

export function getUserByEmail(email: string): User | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email) as User | undefined;
}

export function getUserById(id: number): User | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) as User | undefined;
}

export function updateUserTokens(email: string, accessToken: string, refreshToken: string): void {
  const stmt = db.prepare(`
    UPDATE users
    SET google_access_token = ?,
        google_refresh_token = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE email = ?
  `);
  stmt.run(accessToken, refreshToken, email);
}

// Flight operations
export interface Flight {
  id?: number;
  user_email: string;
  confirmation_number?: string;
  flight_date: string;
  departure_airport: string;
  arrival_airport: string;
  departure_city?: string;
  arrival_city?: string;
  airline?: string;
  flight_number?: string;
  departure_lat?: number;
  departure_lng?: number;
  arrival_lat?: number;
  arrival_lng?: number;
  raw_email_snippet?: string;
  created_at?: string;
}

export function createFlight(flight: Flight): Flight {
  const stmt = db.prepare(`
    INSERT INTO flights (
      user_email, confirmation_number, flight_date,
      departure_airport, arrival_airport, departure_city, arrival_city,
      airline, flight_number,
      departure_lat, departure_lng, arrival_lat, arrival_lng,
      raw_email_snippet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    flight.user_email,
    flight.confirmation_number || null,
    flight.flight_date,
    flight.departure_airport,
    flight.arrival_airport,
    flight.departure_city || null,
    flight.arrival_city || null,
    flight.airline || null,
    flight.flight_number || null,
    flight.departure_lat || null,
    flight.departure_lng || null,
    flight.arrival_lat || null,
    flight.arrival_lng || null,
    flight.raw_email_snippet || null
  );

  return getFlightById(result.lastInsertRowid as number)!;
}

export function getFlightById(id: number): Flight | undefined {
  const stmt = db.prepare('SELECT * FROM flights WHERE id = ?');
  return stmt.get(id) as Flight | undefined;
}

export function getFlightsByUser(userEmail: string): Flight[] {
  const stmt = db.prepare('SELECT * FROM flights WHERE user_email = ? ORDER BY flight_date DESC');
  return stmt.all(userEmail) as Flight[];
}

export function getFlightsByDateRange(userEmail: string, startDate: string, endDate: string): Flight[] {
  const stmt = db.prepare(`
    SELECT * FROM flights
    WHERE user_email = ? AND flight_date BETWEEN ? AND ?
    ORDER BY flight_date DESC
  `);
  return stmt.all(userEmail, startDate, endDate) as Flight[];
}

export function getAirportVisits(userEmail: string, year?: number): any[] {
  let query = `
    SELECT DISTINCT departure_airport as airport, departure_city as city
    FROM flights WHERE user_email = ?
  `;

  if (year) {
    query += ` AND strftime('%Y', flight_date) = '${year}'`;
  }

  query += `
    UNION
    SELECT DISTINCT arrival_airport as airport, arrival_city as city
    FROM flights WHERE user_email = ?
  `;

  if (year) {
    query += ` AND strftime('%Y', flight_date) = '${year}'`;
  }

  const stmt = db.prepare(query);
  return stmt.all(userEmail, userEmail) as any[];
}

export function getTotalFlights(userEmail: string, year?: number): number {
  let query = 'SELECT COUNT(*) as count FROM flights WHERE user_email = ?';
  const params: any[] = [userEmail];

  if (year) {
    query += ` AND strftime('%Y', flight_date) = ?`;
    params.push(year.toString());
  }

  const stmt = db.prepare(query);
  const result = stmt.get(...params) as { count: number };
  return result.count;
}

export function getFlightsByAirport(userEmail: string, airportCode: string): Flight[] {
  const stmt = db.prepare(`
    SELECT * FROM flights
    WHERE user_email = ? AND (departure_airport = ? OR arrival_airport = ?)
    ORDER BY flight_date DESC
  `);
  return stmt.all(userEmail, airportCode, airportCode) as Flight[];
}

export function getAirlineStats(userEmail: string): any[] {
  const stmt = db.prepare(`
    SELECT airline, COUNT(*) as count
    FROM flights
    WHERE user_email = ? AND airline IS NOT NULL
    GROUP BY airline
    ORDER BY count DESC
  `);
  return stmt.all(userEmail) as any[];
}

// Export database instance for custom queries if needed
export { db };
