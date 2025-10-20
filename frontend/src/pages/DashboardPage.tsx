import { Container, Box, Typography, Button, AppBar, Toolbar } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../contexts/AuthContext';
import { ChatInterface } from '../components/Chat/ChatInterface';
import { FlightGlobe } from '../components/Globe/FlightGlobe';

export function DashboardPage() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
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
            <ChatInterface />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <FlightGlobe />
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
