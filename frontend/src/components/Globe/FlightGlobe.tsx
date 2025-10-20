import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { Box, CircularProgress, Typography, Alert, Chip } from '@mui/material';
import { apiClient, type Flight } from '../../services/api';

interface AirportPoint {
  code: string;
  city: string;
  lat: number;
  lng: number;
  count: number;
}

interface FlightArc {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  airline?: string;
  date: string;
}

interface GlobeData {
  airports: AirportPoint[];
  flights: FlightArc[];
}

// Transform Flight[] into GlobeData
function transformFlightsToGlobeData(flights: Flight[]): GlobeData {
  const airportMap = new Map<string, AirportPoint>();
  const flightArcs: FlightArc[] = [];

  flights.forEach((flight) => {
    // Only process flights with valid coordinates
    if (
      !flight.departure_lat || !flight.departure_lng ||
      !flight.arrival_lat || !flight.arrival_lng
    ) {
      return;
    }

    // Add/update departure airport
    const depKey = flight.departure_airport;
    if (airportMap.has(depKey)) {
      airportMap.get(depKey)!.count++;
    } else {
      airportMap.set(depKey, {
        code: flight.departure_airport,
        city: flight.departure_city || flight.departure_airport,
        lat: flight.departure_lat,
        lng: flight.departure_lng,
        count: 1,
      });
    }

    // Add/update arrival airport
    const arrKey = flight.arrival_airport;
    if (airportMap.has(arrKey)) {
      airportMap.get(arrKey)!.count++;
    } else {
      airportMap.set(arrKey, {
        code: flight.arrival_airport,
        city: flight.arrival_city || flight.arrival_airport,
        lat: flight.arrival_lat,
        lng: flight.arrival_lng,
        count: 1,
      });
    }

    // Create flight arc
    flightArcs.push({
      from: { lat: flight.departure_lat, lng: flight.departure_lng },
      to: { lat: flight.arrival_lat, lng: flight.arrival_lng },
      airline: flight.airline,
      date: flight.flight_date,
    });
  });

  return {
    airports: Array.from(airportMap.values()),
    flights: flightArcs,
  };
}

export function FlightGlobe() {
  const globeEl = useRef<any>();
  const [globeData, setGlobeData] = useState<GlobeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<AirportPoint | null>(null);
  const [hoveredArc, setHoveredArc] = useState<FlightArc | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const hasInitializedView = useRef(false);

  // Container ref to measure dimensions
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch globe data
  useEffect(() => {
    const fetchGlobeData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiClient.getFlights();
        const transformedData = transformFlightsToGlobeData(response.flights);
        setGlobeData(transformedData);
      } catch (err) {
        console.error('Error fetching globe data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load globe data');
      } finally {
        setLoading(false);
      }
    };

    fetchGlobeData();
  }, []);

  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };

    // Initial measurement with a small delay to ensure container is rendered
    const timeoutId = setTimeout(updateDimensions, 100);

    // Use ResizeObserver to watch container size changes
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', updateDimensions);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Initialize globe view centered on the continental US without auto-rotation
  useEffect(() => {
    if (
      !hasInitializedView.current &&
      globeEl.current &&
      globeData &&
      dimensions.width > 0 &&
      dimensions.height > 0
    ) {
      const controls = globeEl.current.controls();
      controls.autoRotate = false;
      globeEl.current.pointOfView({ lat: 38, lng: -97, altitude: 1.7 });
      hasInitializedView.current = true;
    }
  }, [globeData, dimensions]);

  // Filter flights by selected airport
  const filteredFlights = selectedAirport && globeData
    ? globeData.flights.filter(
        (flight) =>
          globeData.airports.find(
            (a) => a.code === selectedAirport &&
            ((a.lat === flight.from.lat && a.lng === flight.from.lng) ||
             (a.lat === flight.to.lat && a.lng === flight.to.lng))
          )
      )
    : globeData?.flights || [];

  const handleAirportClick = (point: any) => {
    if (point && point.code) {
      setSelectedAirport(point.code === selectedAirport ? null : point.code);
    }
  };

  const handleClearFilter = () => {
    setSelectedAirport(null);
  };

  if (loading) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          borderRadius: 2,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ height: '100%', p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!globeData || globeData.airports.length === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          borderRadius: 2,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          No flight data available. Scan your emails to get started!
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        height: '100%',
        position: 'relative',
        bgcolor: '#0f172a',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Filter chip */}
      {selectedAirport && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 10,
          }}
        >
          <Chip
            label={`Filtered: ${selectedAirport}`}
            onDelete={handleClearFilter}
            color="default"
            sx={{ bgcolor: 'rgba(255, 255, 255, 0.9)' }}
          />
        </Box>
      )}

      {/* Hover tooltip */}
      {(hoveredPoint || hoveredArc) && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            p: 2,
            borderRadius: 1,
            minWidth: 200,
          }}
        >
          {hoveredPoint && (
            <>
              <Typography variant="subtitle2" fontWeight="bold">
                {hoveredPoint.code}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {hoveredPoint.city}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {hoveredPoint.count} flight{hoveredPoint.count !== 1 ? 's' : ''}
              </Typography>
            </>
          )}
          {hoveredArc && (
            <>
              <Typography variant="subtitle2" fontWeight="bold">
                {hoveredArc.airline || 'Flight'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {new Date(hoveredArc.date).toLocaleDateString()}
              </Typography>
            </>
          )}
        </Box>
      )}

      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(15, 23, 42, 1)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        // Airports as points
        pointsData={globeData.airports}
        pointLat={(d: any) => d.lat}
        pointLng={(d: any) => d.lng}
        pointAltitude={0.01}
        pointRadius={(d: any) => Math.max(0.15, Math.min(0.5, d.count * 0.05))}
        pointColor={() => '#ff6b6b'}
        pointLabel={(d: any) => `
          <div style="background: rgba(0,0,0,0.8); padding: 8px; border-radius: 4px; color: white;">
            <strong>${d.code}</strong><br/>
            ${d.city}<br/>
            ${d.count} flight${d.count !== 1 ? 's' : ''}
          </div>
        `}
        onPointClick={handleAirportClick}
        onPointHover={(point: any) => setHoveredPoint(point)}
        // Flight paths as arcs
        arcsData={filteredFlights}
        arcStartLat={(d: any) => d.from.lat}
        arcStartLng={(d: any) => d.from.lng}
        arcEndLat={(d: any) => d.to.lat}
        arcEndLng={(d: any) => d.to.lng}
        arcColor={() => ['rgba(100, 200, 255, 0.5)', 'rgba(255, 150, 100, 0.5)']}
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={2000}
        arcStroke={0.5}
        arcAltitudeAutoScale={0.3}
        arcLabel={(d: any) => `
          <div style="background: rgba(0,0,0,0.8); padding: 8px; border-radius: 4px; color: white;">
            ${d.airline ? `<strong>${d.airline}</strong><br/>` : ''}
            ${new Date(d.date).toLocaleDateString()}
          </div>
        `}
        onArcHover={(arc: any) => setHoveredArc(arc)}
        arcsTransitionDuration={1000}
      />

      {/* Legend */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          zIndex: 10,
          bgcolor: 'rgba(255, 255, 255, 0.9)',
          p: 2,
          borderRadius: 1,
        }}
      >
        <Typography variant="caption" display="block" gutterBottom fontWeight="bold">
          Legend
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: '#ff6b6b',
            }}
          />
          <Typography variant="caption">Airports</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 12,
              height: 2,
              background: 'linear-gradient(90deg, rgba(100, 200, 255, 0.8), rgba(255, 150, 100, 0.8))',
            }}
          />
          <Typography variant="caption">Flight Paths</Typography>
        </Box>
        <Typography variant="caption" display="block" sx={{ mt: 1, fontStyle: 'italic' }}>
          Click airports to filter
        </Typography>
      </Box>
    </Box>
  );
}
