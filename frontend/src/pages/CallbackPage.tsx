import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Box, Typography, CircularProgress, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export function CallbackPage() {
  const navigate = useNavigate();
  const { checkAuthStatus } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check if there's an error in the URL params
        const urlParams = new URLSearchParams(window.location.search);
        const errorParam = urlParams.get('error');

        if (errorParam) {
          setError(`Authentication failed: ${errorParam}`);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        // Wait a moment for the backend to set the session cookie
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Check authentication status
        await checkAuthStatus();

        // Redirect to dashboard
        navigate('/dashboard');
      } catch (err) {
        console.error('Callback error:', err);
        setError('Authentication failed. Please try again.');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [navigate, checkAuthStatus]);

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
        {error ? (
          <Alert severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        ) : (
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress size={60} sx={{ mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Completing sign in...
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}
