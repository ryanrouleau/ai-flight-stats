import { useState } from 'react';
import { Container, Box, Typography, Button, AppBar, Toolbar } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../contexts/AuthContext';
import { ChatInterface } from '../components/Chat/ChatInterface';
import { FlightGlobe, type GlobeFocus } from '../components/Globe/FlightGlobe';
import { type ChatResponse, type ToolCall, type Flight } from '../services/api';

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

function extractGlobeFocus(toolCalls?: ToolCall[]): GlobeFocus {
  if (!toolCalls || toolCalls.length === 0) {
    return { type: 'all' };
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
    setGlobeFocus(extractGlobeFocus(response.toolCalls));
  };

  const handleScanComplete = () => {
    setGlobeFocus({ type: 'all' });
    setGlobeRefreshKey((prev) => prev + 1);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            AI Flight Stats
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
