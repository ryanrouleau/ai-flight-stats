import { Button, Box } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { apiClient } from '../../services/api';

export function LoginButton() {
  const handleLogin = () => {
    // Redirect to backend OAuth endpoint
    window.location.href = apiClient.getGoogleAuthUrl();
  };

  return (
    <Button
      variant="contained"
      size="large"
      startIcon={
        <Box
          component="span"
          sx={{
            backgroundColor: 'white',
            borderRadius: '4px',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <GoogleIcon sx={{ color: '#4285F4' }} />
        </Box>
      }
      onClick={handleLogin}
      sx={{
        backgroundColor: '#4285F4',
        color: 'white',
        padding: '10px 24px',
        fontSize: '16px',
        fontWeight: 500,
        '&:hover': {
          backgroundColor: '#357AE8',
        },
      }}
    >
      Sign in with Google
    </Button>
  );
}
