import { Router, Request, Response } from 'express';
import { gmailService } from '../services/gmail.service';
import { createUser, getUserByEmail, updateUserTokens } from '../services/db.service';

const router = Router();

// Extend session type to include user email
declare module 'express-session' {
  interface SessionData {
    userEmail: string;
  }
}

/**
 * GET /auth/google
 * Initiate OAuth flow
 */
router.get('/google', (req: Request, res: Response) => {
  try {
    // Debug logging
    console.log('OAuth Config:', {
      clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...',
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    });

    const authUrl = gmailService.getAuthUrl();
    console.log('Generated auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

/**
 * GET /auth/google/callback
 * Handle OAuth callback from Google
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  // Debug logging
  console.log('Callback received with query params:', req.query);
  console.log('Full URL:', req.url);

  const { code, error } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}?error=auth_failed`);
  }

  if (!code || typeof code !== 'string') {
    console.error('No code received. Query params:', req.query);
    return res.status(400).json({ error: 'No authorization code provided', received: req.query });
  }

  try {
    // Exchange code for tokens
    const { accessToken, refreshToken } = await gmailService.getTokensFromCode(code);

    if (!refreshToken) {
      throw new Error('No refresh token received. User may need to revoke access and re-authenticate.');
    }

    // Set credentials to get user email
    gmailService.setCredentials(accessToken, refreshToken);
    const userEmail = await gmailService.getUserEmail();

    // Check if user exists
    let user = getUserByEmail(userEmail);

    if (user) {
      // Update existing user's tokens
      updateUserTokens(userEmail, accessToken, refreshToken);
    } else {
      // Create new user
      user = createUser({
        email: userEmail,
        google_access_token: accessToken,
        google_refresh_token: refreshToken,
      });
    }

    // Store user email in session
    req.session.userEmail = userEmail;

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}?auth=success`);
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}?error=auth_failed`);
  }
});

/**
 * GET /auth/status
 * Check authentication status
 */
router.get('/status', (req: Request, res: Response) => {
  if (req.session.userEmail) {
    const user = getUserByEmail(req.session.userEmail);
    if (user) {
      return res.json({
        authenticated: true,
        email: user.email,
      });
    }
  }

  res.json({ authenticated: false });
});

/**
 * POST /auth/logout
 * Clear session and logout
 */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

export default router;
