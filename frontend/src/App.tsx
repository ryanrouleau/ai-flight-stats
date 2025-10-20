import { Routes, Route, Navigate } from 'react-router-dom';
import { Container, Box } from '@mui/material';

// Placeholder components for future phases
function LoginPage() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, textAlign: 'center' }}>
        <h1>AI Flight Stats</h1>
        <p>Login page - to be implemented in Phase 7</p>
      </Box>
    </Container>
  );
}

function DashboardPage() {
  return (
    <Container maxWidth="xl">
      <Box sx={{ mt: 4 }}>
        <h1>Dashboard</h1>
        <p>Chat interface and Globe visualization - to be implemented in Phases 8 & 9</p>
      </Box>
    </Container>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
