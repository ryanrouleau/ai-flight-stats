import { Container, Box, Typography, Paper } from '@mui/material';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import { LoginButton } from '../components/Auth/LoginButton';

export function LoginPage() {
  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 2,
            }}
          >
            <FlightTakeoffIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Typography variant="h4" component="h1" fontWeight="bold">
              Flight Assistant
            </Typography>
          </Box>

          <Typography
            variant="body1"
            color="text.secondary"
            align="center"
            sx={{ mb: 4 }}
          >
            Track your flight history with AI-powered email parsing and
            interactive globe visualization
          </Typography>

          <LoginButton />

          <Typography
            variant="caption"
            color="text.secondary"
            align="center"
            sx={{ mt: 3 }}
          >
            Sign in with your Google account to scan your Gmail for flight
            confirmations
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}
