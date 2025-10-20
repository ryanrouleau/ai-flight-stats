import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import {
  initializeDatabase,
  resetDatabase,
  createUser,
  createFlight,
  findExactDuplicate,
  findFlightChange,
  deleteFlight,
  getFlightsByUser,
  db,
  type Flight,
} from './db.service';

const TEST_DB_PATH = path.join(__dirname, '../../test-flight-dedup.sqlite');
const TEST_USER_EMAIL = 'dedup@example.com';

const baseFlight: Flight = {
  user_email: TEST_USER_EMAIL,
  confirmation_number: 'ABC123',
  flight_date: '2024-05-15',
  departure_time_local: '08:00',
  arrival_time_local: '10:00',
  departure_airport: 'SFO',
  arrival_airport: 'LAX',
  departure_city: 'San Francisco',
  arrival_city: 'Los Angeles',
  airline: 'United Airlines',
  flight_number: 'UA100',
  cabin: 'Economy',
  passenger_names: JSON.stringify(['Test Passenger']),
  departure_lat: 37.6213,
  departure_lng: -122.379,
  arrival_lat: 33.9416,
  arrival_lng: -118.4085,
  email_message_id: 'msg-1',
  email_sent_date: '2024-04-01T10:00:00.000Z',
  email_subject: 'Test Flight',
  raw_email_content: 'Test content',
};

function buildFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    ...baseFlight,
    ...overrides,
  };
}

function parseEmailSentDate(value?: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

before(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  initializeDatabase(TEST_DB_PATH);

  try {
    createUser({ email: TEST_USER_EMAIL });
  } catch {
    // ignore duplicate user creation between test runs
  }
});

afterEach(() => {
  db().prepare('DELETE FROM flights').run();
});

after(() => {
  resetDatabase();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe('Flight deduplication helpers', () => {
  it('detects exact duplicates', () => {
    const existing = createFlight(buildFlight());

    const duplicate = findExactDuplicate(
      buildFlight({
        email_message_id: 'msg-2',
        email_sent_date: '2024-04-02T11:00:00.000Z',
      })
    );

    assert.ok(duplicate, 'Exact duplicate should be found');
    assert.strictEqual(duplicate?.id, existing.id);
  });

  it('replaces outdated flights when newer email arrives', () => {
    const oldFlight = createFlight(
      buildFlight({
        flight_date: '2024-05-10',
        email_message_id: 'msg-old',
        email_sent_date: '2024-04-05T08:00:00.000Z',
      })
    );

    const updatedFlight = buildFlight({
      flight_date: '2024-05-12',
      email_message_id: 'msg-new',
      email_sent_date: '2024-04-06T12:00:00.000Z',
    });

    const changes = findFlightChange(updatedFlight);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0]?.id, oldFlight.id);

    const newTimestamp = parseEmailSentDate(updatedFlight.email_sent_date);
    const existingTimestamps = changes
      .map(f => parseEmailSentDate(f.email_sent_date))
      .filter((value): value is number => value !== undefined);

    assert.ok(
      newTimestamp !== undefined &&
        (existingTimestamps.length === 0 || newTimestamp > Math.max(...existingTimestamps)),
      'New email should be considered more recent'
    );

    for (const change of changes) {
      if (change.id) {
        deleteFlight(change.id);
      }
    }

    createFlight(updatedFlight);

    const flights = getFlightsByUser(TEST_USER_EMAIL);
    assert.strictEqual(flights.length, 1);
    assert.strictEqual(flights[0]?.flight_date, '2024-05-12');
    assert.strictEqual(flights[0]?.email_message_id, 'msg-new');
  });

  it('keeps the most recent flight across multiple changes', () => {
    createFlight(
      buildFlight({
        flight_date: '2024-05-08',
        email_message_id: 'msg-first',
        email_sent_date: '2024-04-03T10:00:00.000Z',
      })
    );

    createFlight(
      buildFlight({
        flight_date: '2024-05-09',
        email_message_id: 'msg-second',
        email_sent_date: '2024-04-04T10:00:00.000Z',
      })
    );

    const newestFlight = buildFlight({
      flight_date: '2024-05-11',
      email_message_id: 'msg-third',
      email_sent_date: '2024-04-07T09:30:00.000Z',
    });

    const changes = findFlightChange(newestFlight);
    assert.strictEqual(changes.length, 2);

    const newTimestamp = parseEmailSentDate(newestFlight.email_sent_date);
    const existingTimestamps = changes
      .map(f => parseEmailSentDate(f.email_sent_date))
      .filter((value): value is number => value !== undefined);

    assert.ok(
      newTimestamp !== undefined && newTimestamp > Math.max(...existingTimestamps)
    );

    for (const change of changes) {
      if (change.id) {
        deleteFlight(change.id);
      }
    }

    createFlight(newestFlight);

    const flights = getFlightsByUser(TEST_USER_EMAIL);
    assert.strictEqual(flights.length, 1);
    assert.strictEqual(flights[0]?.flight_date, '2024-05-11');
    assert.strictEqual(flights[0]?.email_message_id, 'msg-third');
  });

  it('ignores dedup checks when key fields are missing', () => {
    const missingKeys = buildFlight({
      confirmation_number: undefined,
      flight_number: undefined,
      email_message_id: 'msg-null-1',
    });

    const first = createFlight(missingKeys);
    assert.ok(first.id, 'Should insert even without confirmation number');

    const duplicate = findExactDuplicate(missingKeys);
    assert.strictEqual(duplicate, undefined, 'Exact duplicate should not be detected without keys');

    const changes = findFlightChange(missingKeys);
    assert.deepStrictEqual(changes, [], 'Flight changes should not be detected without keys');

    const second = createFlight({
      ...missingKeys,
      email_message_id: 'msg-null-2',
    });

    assert.ok(second.id && second.id !== first.id, 'Should allow multiple entries with NULL keys');

    const flights = getFlightsByUser(TEST_USER_EMAIL);
    assert.strictEqual(flights.length, 2);
  });
});
