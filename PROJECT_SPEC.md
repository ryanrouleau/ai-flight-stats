# AI Flight Stats - Full Stack Application Specification

## Overview
A proof-of-concept full-stack application that scans Gmail for flight confirmation emails, extracts flight data using LLMs, stores it in a database, and provides a chat interface with 3D globe visualization for querying flight history.

## Tech Stack

### Backend
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express
- **Database**: SQLite (better-sqlite3)
- **APIs**:
  - Gmail API (OAuth2, Testing mode, gmail.readonly scope)
  - OpenAI API (GPT-4o)
- **Airport Data**: OurAirports static database (JSON)

### Frontend
- **Framework**: React + TypeScript
- **Build Tool**: Vite
- **UI Library**: Material-UI (MUI)
- **Visualization**: react-globe.gl (3D globe)

## Architecture

### Backend Structure
```
backend/
├── src/
│   ├── services/
│   │   ├── gmail.service.ts        # OAuth flow + email search
│   │   ├── parser.service.ts       # OpenAI email parsing
│   │   ├── chat.service.ts         # OpenAI chat + tool calling
│   │   ├── db.service.ts           # SQLite database operations
│   │   └── airport.service.ts      # Airport lookup from static data
│   ├── routes/
│   │   ├── auth.routes.ts          # OAuth endpoints
│   │   ├── flights.routes.ts       # Flight scanning & retrieval
│   │   └── chat.routes.ts          # Chat endpoint
│   ├── tools/
│   │   └── flight-tools.ts         # Predefined LLM tools
│   ├── data/
│   │   └── airports.json           # OurAirports dataset
│   ├── db/
│   │   └── schema.sql              # Database schema
│   └── server.ts                   # Express app entry point
├── package.json
└── tsconfig.json
```

### Frontend Structure
```
frontend/
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   └── LoginButton.tsx     # Google OAuth login
│   │   ├── Chat/
│   │   │   ├── ChatInterface.tsx   # Main chat component
│   │   │   ├── MessageList.tsx     # Chat messages display
│   │   │   └── ChatInput.tsx       # Message input field
│   │   ├── Globe/
│   │   │   └── FlightGlobe.tsx     # 3D globe with flight paths
│   │   └── Layout/
│   │       ├── AppLayout.tsx       # Main app layout
│   │       └── Navigation.tsx      # Navigation bar
│   ├── services/
│   │   └── api.ts                  # Backend API client
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Database Schema

### users table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  google_access_token TEXT,
  google_refresh_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### flights table
```sql
CREATE TABLE flights (
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
```

## Key Features & Implementation Flow

### 1. Gmail OAuth & Authentication
**Flow:**
1. User clicks "Login with Google"
2. Frontend redirects to backend OAuth endpoint
3. Backend redirects to Google OAuth (Testing mode, gmail.readonly scope)
4. User authorizes app
5. Backend receives authorization code, exchanges for tokens
6. Store tokens in users table
7. Redirect back to frontend with session/JWT

**Endpoints:**
- `GET /auth/google` - Initiate OAuth flow
- `GET /auth/google/callback` - Handle OAuth callback
- `GET /auth/status` - Check authentication status
- `POST /auth/logout` - Clear session

### 2. Email Scanning & Flight Parsing
**Flow:**
1. User clicks "Scan Emails" button in UI
2. Frontend calls `POST /flights/scan`
3. Backend searches Gmail with query: `"flight confirmation" OR "booking confirmation" OR "e-ticket"`
4. For each email found:
   - Extract email content/snippet
   - Call OpenAI API to parse flight details
   - OpenAI returns structured JSON with: confirmation #, date, airline, flight #, airport codes
   - Airport service looks up airport codes in airports.json to get lat/lng coordinates
   - Store complete flight data in flights table
5. Return count of flights found and parsed

**Endpoints:**
- `POST /flights/scan` - Trigger email scan and parsing
- `GET /flights` - Get all flights for authenticated user
- `GET /flights/globe-data` - Get flights formatted for globe visualization

**OpenAI Parsing Prompt:**
```
Extract flight information from this email:
- Confirmation number
- Flight date
- Departure airport code (IATA)
- Arrival airport code (IATA)
- Airline name
- Flight number

Return as JSON.
```

### 3. Airport Coordinate Lookup
**Implementation:**
- Download OurAirports dataset (airports.json)
- Contains ~10k airports with: code, name, city, country, lat, lng
- Airport service loads JSON on startup, provides lookup by IATA code
- After OpenAI extracts airport codes, look them up for coordinates
- Store coordinates in flights table for globe visualization

**Airport Service Methods:**
- `getAirportByCode(iataCode: string)` - Returns airport details + coordinates
- `searchAirports(query: string)` - Search by name/city (optional feature)

### 4. Chat Interface with Tool Calling
**Flow:**
1. User types question: "What airports did I visit last year?"
2. Frontend sends message to `POST /chat`
3. Backend calls OpenAI with:
   - User message
   - Chat history
   - Predefined tools/functions
4. OpenAI decides which tool(s) to call
5. Backend executes tool(s), queries SQLite
6. Returns tool results to OpenAI
7. OpenAI generates natural language response
8. Return response to frontend

**Predefined Tools:**
- `getFlightsByDateRange(startDate, endDate)` - Get flights within date range
- `getAirportVisits(year?)` - Get unique airports visited (optionally filtered by year)
- `getTotalFlights(year?)` - Count total flights (optionally filtered by year)
- `getFlightsByAirport(airportCode)` - Get all flights to/from specific airport
- `getAirlineStats()` - Get flight count per airline

**Endpoints:**
- `POST /chat` - Send message and get response
- `GET /chat/history` - Get chat history (optional)

### 5. Globe Visualization
**Implementation:**
- Use react-globe.gl for 3D Earth rendering
- Display airports as labeled points
- Show flight paths as animated arcs
- Interactive: hover for flight details, click to filter

**Globe Data Format:**
```typescript
{
  airports: [
    { code: 'SFO', city: 'San Francisco', lat: 37.77, lng: -122.4, count: 5 }
  ],
  flights: [
    {
      from: { lat: 37.77, lng: -122.4 },
      to: { lat: 40.64, lng: -73.78 },
      airline: 'United',
      date: '2024-03-15'
    }
  ]
}
```

## Implementation Steps

### Phase 1: Backend Foundation
1. Initialize backend project with TypeScript + Express
2. Setup SQLite database connection
3. Create database schema and migrations
4. Download and integrate OurAirports dataset
5. Implement airport lookup service

### Phase 2: Gmail Integration
6. Setup Google Cloud project, enable Gmail API
7. Implement Gmail OAuth flow (Testing mode)
8. Implement email search functionality
9. Test OAuth and email retrieval

### Phase 3: Flight Parsing
10. Setup OpenAI API client
11. Implement email parsing service with OpenAI
12. Integrate airport coordinate lookup
13. Test parsing various flight confirmation emails

### Phase 4: Chat with Tools
14. Define tool schemas for OpenAI function calling
15. Implement all tool functions (database queries)
16. Create chat service with tool execution loop
17. Test chat with various queries

### Phase 5: Backend API
18. Implement all REST API endpoints
19. Add authentication middleware
20. Add error handling and validation
21. Test all endpoints

### Phase 6: Frontend Foundation
22. Initialize React project with Vite + TypeScript
23. Setup MUI theme and layout
24. Create API client service
25. Setup routing

### Phase 7: Authentication UI
26. Implement login page with Google OAuth button
27. Handle OAuth callback and token storage
28. Implement authentication state management
29. Add protected routes

### Phase 8: Chat Interface
30. Create chat UI with MUI components
31. Implement message list with user/assistant messages
32. Add message input with send button
33. Connect to backend chat endpoint
34. Add scan emails button and functionality

### Phase 9: Globe Visualization
35. Install and setup react-globe.gl
36. Fetch flight data from backend
37. Render airports as points
38. Render flight paths as arcs
39. Add interactivity (hover, click)

### Phase 10: Integration & Polish
40. Connect all components
41. Test end-to-end flow
42. Add loading states and error handling
43. Polish UI/UX
44. Add basic documentation (README)

## Environment Variables

### Backend (.env)
```
PORT=3001
DATABASE_PATH=./database.sqlite
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
OPENAI_API_KEY=your_openai_key
SESSION_SECRET=your_session_secret
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001
```

## API Endpoints Summary

### Authentication
- `GET /auth/google` - Initiate OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/status` - Check auth status
- `POST /auth/logout` - Logout

### Flights
- `POST /flights/scan` - Scan Gmail and parse flights
- `GET /flights` - Get all user flights
- `GET /flights/globe-data` - Get flights for globe visualization

### Chat
- `POST /chat` - Send message and get response

## Testing Strategy
- Manual testing for POC phase
- Test with real Gmail accounts (in Testing mode)
- Test with various airline confirmation emails
- Verify OpenAI parsing accuracy
- Test chat queries match expected results

## Future Enhancements (Out of Scope for POC)
- User authentication with JWT/sessions
- Email scanning on schedule/webhook
- Support for hotel, car rental confirmations
- Export data to CSV/PDF
- Statistics dashboard
- Mobile responsive design
- Production deployment
- Error monitoring and logging
- Rate limiting and security hardening
