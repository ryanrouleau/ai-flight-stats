// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Import express-async-errors to automatically catch async errors
import 'express-async-errors';

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initializeDatabase } from './services/db.service';
import { airportService } from './services/airport.service';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import flightsRoutes from './routes/flights.routes';
import chatRoutes from './routes/chat.routes';

// Initialize database
initializeDatabase();

// Initialize airport service (loads on import)
// This ensures airports are loaded into memory on startup
console.log(`📍 Airport service initialized with ${airportService.getAirportByCode('SFO') ? 'valid data' : 'no data'}`);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/auth', authRoutes);
app.use('/flights', flightsRoutes);
app.use('/chat', chatRoutes);

// Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
