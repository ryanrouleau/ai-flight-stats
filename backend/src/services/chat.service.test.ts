/**
 * Chat Service Unit Tests
 *
 * These tests verify the chat service with OpenAI tool calling.
 * Run with: npm run test:chat
 */

import path from 'path';
import fs from 'fs';

// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

// Initialize test database BEFORE importing other modules
import { initializeDatabase, resetDatabase, createUser, createFlight } from './db.service';

const TEST_DB_PATH = path.join(__dirname, '../../test-chat-service.sqlite');

// Clean up any existing test database
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// Initialize with test database path
initializeDatabase(TEST_DB_PATH);

// NOW import everything else
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chat } from './chat.service';

// Test user
const TEST_USER_EMAIL = 'test-chat@example.com';

describe('Chat Service - Tool Calling', () => {
  before(async () => {
    console.log(`\n✅ Setting up test data for ${TEST_USER_EMAIL}\n`);

    try {
      // Create test user
      createUser({
        email: TEST_USER_EMAIL,
        google_access_token: 'test_token',
        google_refresh_token: 'test_refresh',
      });
    } catch (error) {
      console.error('Error creating test user:', error);
      throw error;
    }

    // Create test flights
    const flights = [
      // Flight 1: SFO -> JFK (2024-01-15)
      {
        user_email: TEST_USER_EMAIL,
        flight_date: '2024-01-15',
        departure_time_local: '08:00',
        arrival_time_local: '16:30',
        departure_airport: 'SFO',
        arrival_airport: 'JFK',
        departure_city: 'San Francisco',
        arrival_city: 'New York',
        airline: 'United Airlines',
        flight_number: 'UA123',
        confirmation_number: 'ABC123',
        departure_lat: 37.6213,
        departure_lng: -122.379,
        arrival_lat: 40.6413,
        arrival_lng: -73.7781,
      },
      // Flight 2: JFK -> LAX (2024-01-20)
      {
        user_email: TEST_USER_EMAIL,
        flight_date: '2024-01-20',
        departure_time_local: '10:00',
        arrival_time_local: '13:30',
        departure_airport: 'JFK',
        arrival_airport: 'LAX',
        departure_city: 'New York',
        arrival_city: 'Los Angeles',
        airline: 'Delta',
        flight_number: 'DL456',
        confirmation_number: 'XYZ789',
        departure_lat: 40.6413,
        departure_lng: -73.7781,
        arrival_lat: 33.9416,
        arrival_lng: -118.4085,
      },
      // Flight 3: LAX -> ORD (2023-06-10)
      {
        user_email: TEST_USER_EMAIL,
        flight_date: '2023-06-10',
        departure_time_local: '07:00',
        arrival_time_local: '13:00',
        departure_airport: 'LAX',
        arrival_airport: 'ORD',
        departure_city: 'Los Angeles',
        arrival_city: 'Chicago',
        airline: 'American Airlines',
        flight_number: 'AA789',
        confirmation_number: 'DEF456',
        departure_lat: 33.9416,
        departure_lng: -118.4085,
        arrival_lat: 41.9742,
        arrival_lng: -87.9073,
      },
      // Flight 4: ORD -> SFO (2023-06-15)
      {
        user_email: TEST_USER_EMAIL,
        flight_date: '2023-06-15',
        departure_time_local: '14:00',
        arrival_time_local: '17:00',
        departure_airport: 'ORD',
        arrival_airport: 'SFO',
        departure_city: 'Chicago',
        arrival_city: 'San Francisco',
        airline: 'United Airlines',
        flight_number: 'UA456',
        confirmation_number: 'GHI012',
        departure_lat: 41.9742,
        departure_lng: -87.9073,
        arrival_lat: 37.6213,
        arrival_lng: -122.379,
      },
    ];

    try {
      for (const flightData of flights) {
        createFlight(flightData);
      }
      console.log(`✅ Created 4 test flights for ${TEST_USER_EMAIL}\n`);
    } catch (error) {
      console.error('Error creating test flights:', error);
      throw error;
    }
  });
  after(() => {
    // Clean up test database
    console.log('\n🧹 Cleaning up test database');
    resetDatabase();

    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    console.log('✅ Test database cleaned up\n');
  });
  it('should get total flights count', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  Skipping test: OPENAI_API_KEY not set');
      return;
    }

    const response = await chat(
      { message: 'How many total flights do I have?' },
      TEST_USER_EMAIL
    );

    console.log('\n📨 Q: How many total flights do I have?');
    console.log(`🤖 A: ${response.message.content}`);
    console.log(`🔧 Tools: ${response.toolCalls?.map(t => t.tool).join(', ') || 'none'}\n`);

    assert.ok(response.message.content, 'Should return a message');
    assert.ok(response.toolCalls && response.toolCalls.length > 0, 'Should have tool calls');

    // Check that getTotalFlights was called
    const totalFlightsTool = response.toolCalls.find(tc => tc.tool === 'getTotalFlights');
    assert.ok(totalFlightsTool, 'Should call getTotalFlights tool');
    assert.strictEqual(totalFlightsTool.result.total, 4, 'Should return 4 total flights');
  });

  it('should get flights by date range', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  Skipping test: OPENAI_API_KEY not set');
      return;
    }

    const response = await chat(
      { message: 'What flights did I take in 2024?' },
      TEST_USER_EMAIL
    );

    console.log('\n📨 Q: What flights did I take in 2024?');
    console.log(`🤖 A: ${response.message.content}`);
    console.log(`🔧 Tools: ${response.toolCalls?.map(t => t.tool).join(', ') || 'none'}\n`);

    assert.ok(response.message.content, 'Should return a message');
    assert.ok(response.toolCalls && response.toolCalls.length > 0, 'Should have tool calls');

    // Should call getFlightsByDateRange
    const dateRangeTool = response.toolCalls.find(tc => tc.tool === 'getFlightsByDateRange');
    assert.ok(dateRangeTool, 'Should call getFlightsByDateRange tool');
    assert.ok(Array.isArray(dateRangeTool.result), 'Should return array of flights');
    assert.strictEqual(dateRangeTool.result.length, 2, 'Should return 2 flights from 2024');
  });

  it('should get unique airports visited', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  Skipping test: OPENAI_API_KEY not set');
      return;
    }

    const response = await chat(
      { message: 'What airports have I visited?' },
      TEST_USER_EMAIL
    );

    console.log('\n📨 Q: What airports have I visited?');
    console.log(`🤖 A: ${response.message.content}`);
    console.log(`🔧 Tools: ${response.toolCalls?.map(t => t.tool).join(', ') || 'none'}\n`);

    assert.ok(response.message.content, 'Should return a message');
    assert.ok(response.toolCalls && response.toolCalls.length > 0, 'Should have tool calls');

    // Should call getAirportVisits
    const airportsTool = response.toolCalls.find(tc => tc.tool === 'getAirportVisits');
    assert.ok(airportsTool, 'Should call getAirportVisits tool');
    assert.ok(Array.isArray(airportsTool.result), 'Should return array of airports');
    // We have 4 unique airports: SFO, JFK, LAX, ORD
    assert.strictEqual(airportsTool.result.length, 4, 'Should return 4 unique airports');
  });

  it('should get airline statistics', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  Skipping test: OPENAI_API_KEY not set');
      return;
    }

    const response = await chat(
      { message: 'Which airlines have I flown with the most?' },
      TEST_USER_EMAIL
    );

    console.log('\n📨 Q: Which airlines have I flown with the most?');
    console.log(`🤖 A: ${response.message.content}`);
    console.log(`🔧 Tools: ${response.toolCalls?.map(t => t.tool).join(', ') || 'none'}\n`);

    assert.ok(response.message.content, 'Should return a message');
    assert.ok(response.toolCalls && response.toolCalls.length > 0, 'Should have tool calls');

    // Should call getAirlineStats
    const statsTool = response.toolCalls.find(tc => tc.tool === 'getAirlineStats');
    assert.ok(statsTool, 'Should call getAirlineStats tool');
    assert.ok(Array.isArray(statsTool.result), 'Should return array of airline stats');
    assert.strictEqual(statsTool.result.length, 3, 'Should return 3 airlines');

    // United should have 2 flights, others should have 1
    const unitedStats = statsTool.result.find((s: any) => s.airline === 'United Airlines');
    assert.ok(unitedStats, 'Should have United Airlines stats');
    assert.strictEqual(unitedStats.count, 2, 'United Airlines should have 2 flights');
  });

  it('should get flights by specific airport', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  Skipping test: OPENAI_API_KEY not set');
      return;
    }

    const response = await chat(
      { message: 'What flights did I have from JFK?' },
      TEST_USER_EMAIL
    );

    console.log('\n📨 Q: What flights did I have from JFK?');
    console.log(`🤖 A: ${response.message.content}`);
    console.log(`🔧 Tools: ${response.toolCalls?.map(t => t.tool).join(', ') || 'none'}\n`);

    assert.ok(response.message.content, 'Should return a message');
    assert.ok(response.toolCalls && response.toolCalls.length > 0, 'Should have tool calls');

    // Should call getFlightsByAirport
    const airportTool = response.toolCalls.find(tc => tc.tool === 'getFlightsByAirport');
    assert.ok(airportTool, 'Should call getFlightsByAirport tool');
    assert.strictEqual(airportTool.arguments.airportCode, 'JFK', 'Should query JFK airport');
    assert.ok(Array.isArray(airportTool.result), 'Should return array of flights');
    // We have SFO->JFK and JFK->LAX
    assert.strictEqual(airportTool.result.length, 2, 'Should return 2 flights involving JFK');
  });

  it('should handle conversation history', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  Skipping test: OPENAI_API_KEY not set');
      return;
    }

    // First message
    const response1 = await chat(
      { message: 'How many flights did I take in 2024?' },
      TEST_USER_EMAIL
    );

    console.log('\n📨 Q1: How many flights did I take in 2024?');
    console.log(`🤖 A1: ${response1.message.content}\n`);

    // Second message with history - should understand "them" refers to 2024 flights
    const response2 = await chat(
      {
        message: 'Which airlines operated them?',
        history: [
          { role: 'user', content: 'How many flights did I take in 2024?' },
          { role: 'assistant', content: response1.message.content },
        ],
      },
      TEST_USER_EMAIL
    );

    console.log('📨 Q2: Which airlines operated them?');
    console.log(`🤖 A2: ${response2.message.content}\n`);

    assert.ok(response2.message.content, 'Should return a message');
    // The assistant should understand context and query 2024 flights
    assert.ok(
      response2.message.content.includes('United') || response2.message.content.includes('Delta'),
      'Should mention airlines from 2024 flights'
    );
  });

  it('should handle year filtering correctly', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  Skipping test: OPENAI_API_KEY not set');
      return;
    }

    const response = await chat(
      { message: 'How many flights did I take in 2023?' },
      TEST_USER_EMAIL
    );

    console.log('\n📨 Q: How many flights did I take in 2023?');
    console.log(`🤖 A: ${response.message.content}`);
    console.log(`🔧 Tools: ${response.toolCalls?.map(t => t.tool).join(', ') || 'none'}\n`);

    assert.ok(response.message.content, 'Should return a message');

    // Check if the right year was queried
    const totalTool = response.toolCalls?.find(tc => tc.tool === 'getTotalFlights');
    if (totalTool) {
      assert.strictEqual(totalTool.arguments.year, 2023, 'Should query year 2023');
      assert.strictEqual(totalTool.result.total, 2, 'Should return 2 flights from 2023');
    }
  });
});
