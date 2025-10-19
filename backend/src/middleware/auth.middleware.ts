import { Request, Response, NextFunction } from 'express';
import { getUserByEmail } from '../services/db.service';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        email: string;
        google_access_token?: string;
        google_refresh_token?: string;
      };
    }
  }
}

/**
 * Middleware to check if user is authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userEmail) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = getUserByEmail(req.session.userEmail);

  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  // Attach user to request
  req.user = {
    email: user.email,
    google_access_token: user.google_access_token,
    google_refresh_token: user.google_refresh_token,
  };

  next();
}
