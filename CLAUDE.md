# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AI Flight Stats is a full-stack TypeScript application that scans Gmail for flight confirmations, uses GPT to extract flight data, and visualizes travel history through chat and a 3D globe.

**⚠️ NOT production-ready.** Built for experimentation. See README.md for security concerns.

## Tech Stack

- **Backend:** Node.js, TypeScript, Express, SQLite (better-sqlite3), Gmail API, OpenAI API (GPT-5-mini)
- **Frontend:** React 19, TypeScript, Vite, Material-UI, react-globe.gl

## Common Commands

### Backend (from `backend/` directory)
```bash
npm run dev              # Start dev server with hot reload (tsx watch)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled server from dist/
npm test                 # Run all tests
npm run test:parser      # Run parser service tests only
npm run test:chat        # Run chat service tests only
```

### Frontend (from `frontend/` directory)
```bash
npm run dev              # Start Vite dev server (default: http://localhost:5173)
npm run build            # Build for production (tsc + vite build)
npm run lint             # Run ESLint
npm run preview          # Preview production build
```

### Running the Application
Requires two terminals:
1. `cd backend && npm run dev` (runs on port 3001)
2. `cd frontend && npm run dev` (runs on port 5173)

## Architecture

### Data Flow

1. **OAuth → Email Scanning**: User authenticates via Google OAuth → Backend fetches flight confirmation emails via Gmail API
2. **AI Parsing**: Raw emails → `parser.service.ts` (Cheerio HTML cleaning) → GPT-5-mini structured outputs (Zod schemas) → Parsed flight data
3. **Storage**: Parsed flights → SQLite with deduplication (unique index on user_email + confirmation_number + flight_date + airports + flight_number)
4. **Chat**: User query → `chat.service.ts` → GPT-5-mini function calling → `flight-tools.ts` → `db.service.ts` queries → Response with `<globe_focus>` directive
5. **Visualization**: Chat response → Frontend parses `<globe_focus>` JSON → `FlightGlobe.tsx` highlights specific flights/airports on 3D globe

### Key Services (Backend)

- **`gmail.service.ts`**: Gmail API OAuth flow, email search, fetch
- **`parser.service.ts`**: HTML → plaintext (Cheerio), GPT-5-mini structured extraction (Zod schemas), airport validation
- **`chat.service.ts`**: GPT-5-mini function calling loop, tool execution, `<globe_focus>` parsing
- **`flight-tools.ts`**: OpenAI function definitions for querying flights (date range, airport, airline stats, email bodies)
- **`db.service.ts`**: SQLite operations with lazy initialization, flight CRUD, deduplication
- **`airport.service.ts`**: IATA code lookup from static JSON dataset (`backend/src/data/airports.json`)

### Database Schema

**`flights` table** (see `backend/src/db/schema.sql`):
- Core fields: `user_email`, `confirmation_number`, `flight_date`, `departure_airport`, `arrival_airport`, `airline`, `flight_number`, `cabin`
- Times: `departure_time_local`, `arrival_time_local` (HH:mm 24h format)
- Coordinates: `departure_lat`, `departure_lng`, `arrival_lat`, `arrival_lng`
- Email metadata: `email_message_id`, `email_sent_date`, `email_subject`, `raw_email_content`
- **Unique index**: Prevents duplicate flights via composite key on user_email + confirmation_number + flight_date + departure_airport + arrival_airport + flight_number

### Globe Focus Protocol

The chat service instructs the frontend which flights/airports to highlight via a `<globe_focus>` XML block in responses:

```json
{
  "mode": "all" | "flights" | "airports",
  "flights": [SanitizedFlight, ...],     // mode="flights"
  "airports": [{"code": "SFO", "city": "San Francisco"}, ...]  // mode="airports"
}
```

- **"all"**: Show full dataset
- **"flights"**: Highlight specific flight paths (includes full flight objects with coordinates)
- **"airports"**: Highlight specific airport points only

Parsed in `chat.service.ts:parseGlobeFocusBlock()`, consumed by `FlightGlobe.tsx`.

## Important Patterns

### OpenAI Usage
- **Model**: `gpt-5-mini` (set via `OPENAI_MODEL` env var or hardcoded)
- **Structured Outputs**: Parser uses `zodResponseFormat()` for strict schema adherence
- **Function Calling**: Chat service uses tool loop with max 5 iterations to prevent infinite loops
- **Concurrency Control**: Parser uses `p-limit(3)` to avoid rate limits
- **Retry Logic**: Parser has exponential backoff for 429/5xx errors

### Flight Deduplication
Flights are deduplicated via SQLite unique index. When inserting flights:
1. Attempt `INSERT` with all fields
2. On conflict (duplicate), the insert is ignored (see `db.service.ts:insertFlight()`)
3. This prevents re-importing the same flight from multiple email scans

### Session Management
- **In-memory sessions** using `express-session` (⚠️ not suitable for production)
- User email stored in `req.session.userEmail` after OAuth
- No persistent session store → sessions lost on server restart

### Environment Variables
Required `.env` files:
- **Backend** (`backend/.env`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OPENAI_API_KEY`, `SESSION_SECRET`, `FRONTEND_URL`
- **Frontend** (`frontend/.env`): `VITE_API_URL`

## Frontend Architecture

### Component Hierarchy
```
App
├── LoginPage
├── CallbackPage (OAuth redirect handler)
└── DashboardPage
    ├── ChatInterface
    │   ├── MessageList (displays chat history)
    │   └── ChatInput (user input)
    └── FlightGlobe (3D visualization via react-globe.gl)
```

### State Flow
- **AuthContext**: Manages auth status, user email, login/logout
- **ChatInterface**: Local state for messages, sends requests to backend, emits `onChatResponse` events
- **DashboardPage**: Receives chat responses → extracts `globeFocus` → passes to `FlightGlobe` via props
- **FlightGlobe**: Maintains `allFlights` state, applies focus filters to highlight subset

## Testing

### Backend Tests
- **Parser tests** (`parser.service.test.ts`): Validates HTML cleaning, GPT parsing, flight normalization
- **Chat tests** (`chat.service.test.ts`): Tests function calling loop, tool execution, globe focus parsing
- Run via Node.js native test runner (`tsx --test`)

### Running Specific Tests
```bash
npm run test:parser    # Parser only
npm run test:chat      # Chat only
npm test               # All tests
```

## Common Development Tasks

### Adding a New Flight Query Tool
1. Define function in `backend/src/tools/flight-tools.ts` (OpenAI function schema)
2. Add case to `executeTool()` in `backend/src/services/chat.service.ts`
3. Implement query function in `backend/src/services/db.service.ts`
4. Update `ToolName` and `ToolArguments` types in `flight-tools.ts`

### Database Migrations
Migration scripts in `backend/src/db/migrations/`:
- Run manually: `tsx backend/src/db/migrations/<migration-file>.ts`
- Migrations are NOT automatically applied (no migration framework)

### Modifying Flight Schema
1. Update Zod schema in `parser.service.ts` (e.g., `FlightSegmentSchema`)
2. Update `ParsedFlight` interface
3. Update `flights` table schema in `backend/src/db/schema.sql`
4. Write migration script in `backend/src/db/migrations/`
5. Update `db.service.ts` insert/query functions
6. Update frontend types if needed

## Security Notes (from README)

This project has **intentional security gaps** for prototyping:
- Plaintext token storage in SQLite
- No rate limiting, CSRF protection, or input sanitization
- PII stored without encryption
- In-memory sessions (no persistence)

Do NOT use with real user data without major security hardening.
