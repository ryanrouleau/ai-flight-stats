import { useState } from 'react';
import { Container, Box, Typography, Button, AppBar, Toolbar } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../contexts/AuthContext';
import { ChatInterface } from '../components/Chat/ChatInterface';
import { FlightGlobe, type GlobeFocus } from '../components/Globe/FlightGlobe';
import { type ApiGlobeFocus, type ChatResponse, type ToolCall, type Flight } from '../services/api';

function isFlightResult(candidate: unknown): candidate is Flight {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const flight = candidate as Partial<Flight>;
  return (
    typeof flight.departure_airport === 'string' &&
    typeof flight.arrival_airport === 'string' &&
    typeof flight.flight_date === 'string'
  );
}

function extractAirportCode(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const result = candidate as { airport?: unknown; code?: unknown };

  if (typeof result.airport === 'string') {
    return result.airport.toUpperCase();
  }

  if (typeof result.code === 'string') {
    return result.code.toUpperCase();
  }

  return null;
}

function convertApiGlobeFocus(globeFocus?: ApiGlobeFocus): GlobeFocus | null {
  if (!globeFocus || typeof globeFocus.mode !== 'string') {
    return null;
  }

  if (globeFocus.mode === 'all') {
    return { type: 'all' };
  }

  if (globeFocus.mode === 'flights' && Array.isArray(globeFocus.flights) && globeFocus.flights.length > 0) {
    return {
      type: 'flights',
      flights: globeFocus.flights,
    };
  }

  if (globeFocus.mode === 'airports' && Array.isArray(globeFocus.airports) && globeFocus.airports.length > 0) {
    const codes = globeFocus.airports
      .map((airport) => (airport?.code ? airport.code.toUpperCase() : null))
      .filter((code): code is string => !!code);

    if (codes.length > 0) {
      return {
        type: 'airports',
        airportCodes: codes,
      };
    }
  }

  return null;
}

function extractGlobeFocusFromTools(toolCalls?: ToolCall[]): GlobeFocus | null {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  const flights: Flight[] = [];
  const airportCodes = new Set<string>();

  for (const toolCall of toolCalls) {
    if (!toolCall || typeof toolCall.tool !== 'string') {
      continue;
    }

    const { tool, result } = toolCall;

    if ((tool === 'getFlightsByDateRange' || tool === 'getFlightsByAirport') && Array.isArray(result)) {
      result.forEach((item) => {
        if (isFlightResult(item)) {
          flights.push(item);
        }
      });
    }

    if (tool === 'getAirportVisits' && Array.isArray(result)) {
      result.forEach((item) => {
        const code = extractAirportCode(item);
        if (code) {
          airportCodes.add(code);
        }
      });
    }
  }

  if (flights.length > 0) {
    const uniqueFlights = new Map<string, Flight>();
    flights.forEach((flight) => {
      const key =
        flight.id != null
          ? `id-${flight.id}`
          : `${flight.departure_airport}-${flight.arrival_airport}-${flight.flight_date}-${flight.flight_number ?? ''}`;
      if (!uniqueFlights.has(key)) {
        uniqueFlights.set(key, flight);
      }
    });

    return {
      type: 'flights',
      flights: Array.from(uniqueFlights.values()),
    };
  }

  if (airportCodes.size > 0) {
    return {
      type: 'airports',
      airportCodes: Array.from(airportCodes),
    };
  }

  return null;
}

function determineGlobeFocus(response: ChatResponse): GlobeFocus {
  const fromApi = convertApiGlobeFocus(response.globeFocus);
  if (fromApi) {
    return fromApi;
  }

  const fromTools = extractGlobeFocusFromTools(response.toolCalls);
  if (fromTools) {
    return fromTools;
  }

  return { type: 'all' };
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [globeFocus, setGlobeFocus] = useState<GlobeFocus>({ type: 'all' });
  const [globeRefreshKey, setGlobeRefreshKey] = useState(0);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const handleChatResponse = (response: ChatResponse) => {
    setGlobeFocus(determineGlobeFocus(response));
  };

  const handleScanComplete = () => {
    setGlobeFocus({ type: 'all' });
    setGlobeRefreshKey((prev) => prev + 1);
  };

  const handleClearChat = () => {
    setGlobeFocus({ type: 'all' });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Flight Assistant
          </Typography>
          {user && (
            <Typography variant="body2" sx={{ mr: 2 }}>
              {user.email}
            </Typography>
          )}
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ flex: 1, py: 3, overflow: 'hidden', height: 0 }}>
        <Box sx={{ display: 'flex', gap: 3, height: '100%' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ChatInterface
              onChatResponse={handleChatResponse}
              onScanComplete={handleScanComplete}
              onClearChat={handleClearChat}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <FlightGlobe focus={globeFocus} refreshTrigger={globeRefreshKey} />
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
