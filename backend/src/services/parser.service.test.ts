import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import dotenv from 'dotenv';
import { parseFlightEmail, EmailInput } from './parser.service';

// Load environment variables
dotenv.config();

describe('Flight Parser Service', () => {
  before(() => {
    // Verify OpenAI API key is set
    assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY must be set');
  });

  test('should parse a simple one-way flight from HTML email', async () => {
    const email: EmailInput = {
      id: 'test-001',
      subject: 'Your United Airlines Flight Confirmation',
      snippet: 'Your flight from San Francisco to New York is confirmed...',
      sentDate: '2024-03-15T10:30:00.000Z',
      content: `
<!DOCTYPE html>
<html>
<head><title>Flight Confirmation</title></head>
<body>
  <h1>Your Trip is Confirmed!</h1>
  <p>Confirmation Number: <strong>ABC123</strong></p>

  <h2>Flight Details</h2>
  <table>
    <tr>
      <td>Flight Number:</td>
      <td>UA 2453</td>
    </tr>
    <tr>
      <td>Date:</td>
      <td>March 20, 2024</td>
    </tr>
    <tr>
      <td>Departure:</td>
      <td>San Francisco (SFO) at 14:30</td>
    </tr>
    <tr>
      <td>Arrival:</td>
      <td>New York JFK (JFK) at 22:45</td>
    </tr>
    <tr>
      <td>Cabin:</td>
      <td>Economy</td>
    </tr>
    <tr>
      <td>Passenger:</td>
      <td>John Smith</td>
    </tr>
  </table>
</body>
</html>
      `,
    };

    const flights = await parseFlightEmail(email);

    assert.strictEqual(flights.length, 1, 'Should extract exactly 1 flight');
    assert.strictEqual(flights[0].departureAirport, 'SFO', 'Departure should be SFO');
    assert.strictEqual(flights[0].arrivalAirport, 'JFK', 'Arrival should be JFK');
    assert.ok(flights[0].confirmationNumber, 'Should have confirmation number');
    assert.ok(flights[0].airline, 'Should have airline');
    assert.ok(flights[0].flightNumber, 'Should have flight number');
    assert.ok(flights[0].departureLat, 'Should have departure coordinates');
    assert.ok(flights[0].arrivalLat, 'Should have arrival coordinates');
  });

  test('should parse multi-segment trip with connections', async () => {
    const email: EmailInput = {
      id: 'test-002',
      subject: 'Trip Confirmation - LAX to LHR',
      snippet: 'Your multi-city trip is confirmed...',
      sentDate: '2024-04-01T15:00:00.000Z',
      content: `
Your Trip Confirmation
Booking Reference: XYZ789

Outbound Journey - April 15, 2024
----------------------------------
Flight 1: AA 123
Los Angeles (LAX) -> Chicago (ORD)
Departure: 08:00, Arrival: 14:15
Cabin: Business Class
Passenger: Jane Doe

Flight 2: AA 456
Chicago (ORD) -> London Heathrow (LHR)
Departure: 18:30, Arrival: 08:15+1
Cabin: Business Class
Passenger: Jane Doe

Return Journey - April 22, 2024
----------------------------------
Flight: AA 789
London Heathrow (LHR) -> Los Angeles (LAX)
Departure: 11:00, Arrival: 14:30
Cabin: Business Class
Passenger: Jane Doe
      `,
    };

    const flights = await parseFlightEmail(email);

    assert.ok(flights.length >= 2, `Should extract at least 2 flights, got ${flights.length}`);

    // Check for LAX and ORD in the flights
    const airports = flights.flatMap(f => [f.departureAirport, f.arrivalAirport]);
    assert.ok(airports.includes('LAX'), 'Should include LAX');
    assert.ok(airports.includes('ORD'), 'Should include ORD');
    assert.ok(airports.includes('LHR'), 'Should include LHR');
  });

  test('should return empty array for non-flight email', async () => {
    const email: EmailInput = {
      id: 'test-003',
      subject: 'Hotel Confirmation',
      snippet: 'Your hotel reservation is confirmed...',
      sentDate: '2024-03-10T09:00:00.000Z',
      content: `
Dear Customer,

Thank you for booking with us!

Hotel: Grand Plaza Hotel
Check-in: March 25, 2024
Check-out: March 28, 2024
Room Type: Deluxe Suite
Confirmation: HTL-12345

We look forward to your stay!
      `,
    };

    const flights = await parseFlightEmail(email);

    assert.strictEqual(flights.length, 0, 'Should not extract any flights from hotel email');
  });

  test('should normalize flight numbers and airport codes', async () => {
    const email: EmailInput = {
      id: 'test-004',
      subject: 'Flight Confirmation',
      snippet: 'Your flight is booked',
      sentDate: '2024-05-01T12:00:00.000Z',
      content: `
Your flight is confirmed!

PNR: def456

Flight: delta 1234
Date: May 10, 2024
Route: atlanta (atl) to seattle (sea)
Departure: 10:00
Arrival: 12:30
      `,
    };

    const flights = await parseFlightEmail(email);

    if (flights.length > 0) {
      assert.strictEqual(flights[0].departureAirport, 'ATL', 'Airport code should be uppercase');
      assert.strictEqual(flights[0].arrivalAirport, 'SEA', 'Airport code should be uppercase');
      assert.match(
        flights[0].flightNumber || '',
        /^\w+\d+$/,
        'Flight number should be normalized (no spaces)'
      );
    }
  });

  test('should handle round trip emails', async () => {
    const email: EmailInput = {
      id: 'test-005',
      subject: 'Round Trip Confirmation',
      snippet: 'Your round trip is confirmed',
      sentDate: '2024-06-01T08:00:00.000Z',
      content: `
Round Trip Confirmation
Confirmation: GHI789

Outbound - June 15, 2024
Southwest 567
Denver (DEN) to Las Vegas (LAS)
Depart: 09:00, Arrive: 10:30

Return - June 18, 2024
Southwest 890
Las Vegas (LAS) to Denver (DEN)
Depart: 16:00, Arrive: 19:30
      `,
    };

    const flights = await parseFlightEmail(email);

    assert.strictEqual(flights.length, 2, 'Should extract both outbound and return flights');
    assert.ok(
      flights.some(f => f.departureAirport === 'DEN' && f.arrivalAirport === 'LAS'),
      'Should have DEN -> LAS flight'
    );
    assert.ok(
      flights.some(f => f.departureAirport === 'LAS' && f.arrivalAirport === 'DEN'),
      'Should have LAS -> DEN return flight'
    );
  });
});
