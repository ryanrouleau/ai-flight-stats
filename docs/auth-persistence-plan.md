# Authentication Persistence Plan

## Overview

This document outlines the plan to persist authentication tokens across server restarts, eliminating the need for users to re-authenticate via OAuth every time the server restarts.

## Current State Analysis

### What's Working
- OAuth 2.0 flow with Google is implemented
- Access tokens and refresh tokens are saved to the SQLite database
- Users can successfully authenticate and use the application

### Critical Issues

#### 1. Sessions Don't Persist Across Server Restarts
**Problem**: The application uses express-session with the default `MemoryStore`, which stores all session data in memory only.

**Impact**: When the server restarts, all session data is lost, including the `userEmail` that tracks authentication status.

**Current Implementation** (`backend/src/server.ts`):
```javascript
session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  }
})
```

#### 2. Multi-User Token Collision
**Problem**: The `gmailService` is a singleton that shares one `OAuth2Client` instance across all users.

**Impact**: When User B logs in and calls `setCredentials()`, it overwrites User A's credentials. Only the last user to authenticate can successfully use Gmail features.

**Current Implementation** (`backend/src/services/gmail.service.ts`):
```typescript
// Singleton exported instance
export const gmailService = new GmailService();

// Shared OAuth2Client for all users
private _oauth2Client: OAuth2Client | null = null;
```

#### 3. Tokens Not Reloaded from Database
**Problem**: While tokens are saved to the database during OAuth callback, they are never loaded back when the server restarts or sessions are restored.

**Impact**: Stored tokens in the database are orphaned and unused after session expiry.

#### 4. No Automatic Token Refresh
**Problem**: Access tokens expire after approximately 1 hour, but there's no automatic refresh mechanism.

**Impact**: Gmail API calls fail after token expiry with no recovery.

**Note**: A `refreshAccessToken()` method exists in `GmailService` but is never called.

## Database Schema

Current schema supports token persistence (`backend/src/db/schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  google_access_token TEXT,
  google_refresh_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Implementation Plan

### Phase 1: Persistent Session Store

**Goal**: Make sessions survive server restarts

**Steps**:
1. Install `connect-sqlite3` package:
   ```bash
   npm install connect-sqlite3
   npm install --save-dev @types/connect-sqlite3
   ```

2. Update `backend/src/server.ts`:
   ```typescript
   import session from 'express-session';
   import connectSqlite3 from 'connect-sqlite3';

   const SQLiteStore = connectSqlite3(session);

   app.use(
     session({
       store: new SQLiteStore({
         db: 'sessions.db',
         dir: './backend/src/db',
       }),
       secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
       resave: false,
       saveUninitialized: false,
       cookie: {
         secure: process.env.NODE_ENV === 'production',
         httpOnly: true,
         maxAge: 24 * 60 * 60 * 1000, // 24 hours
       },
     })
   );
   ```

**Benefit**: Sessions persist in SQLite database, surviving server restarts.

---

### Phase 2: Fix Multi-User OAuth2Client Management

**Goal**: Create OAuth2Client instances per-user instead of using a shared singleton

**Approach**: Refactor `GmailService` to support per-user OAuth2Client instances

**Steps**:

1. **Update GmailService** (`backend/src/services/gmail.service.ts`):
   - Remove singleton pattern for OAuth2Client
   - Add method to create OAuth2Client with user credentials
   - Keep static methods for creating OAuth URL and exchanging codes

   ```typescript
   class GmailService {
     private oauth2Config: OAuth2ClientOptions;

     constructor() {
       this.oauth2Config = {
         clientId: process.env.GOOGLE_CLIENT_ID!,
         clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
         redirectUri: process.env.GOOGLE_REDIRECT_URI!,
       };
     }

     // Create OAuth2Client for a specific user
     createOAuth2Client(accessToken?: string, refreshToken?: string): OAuth2Client {
       const oauth2Client = new google.auth.OAuth2(
         this.oauth2Config.clientId,
         this.oauth2Config.clientSecret,
         this.oauth2Config.redirectUri
       );

       if (accessToken || refreshToken) {
         oauth2Client.setCredentials({
           access_token: accessToken,
           refresh_token: refreshToken,
         });
       }

       return oauth2Client;
     }

     // Static methods for auth flow (no user credentials needed)
     getAuthUrl(): string { /* ... */ }
     async getTokensFromCode(code: string): Promise<Credentials> { /* ... */ }

     // Instance methods that accept OAuth2Client
     async getProfile(oauth2Client: OAuth2Client): Promise<any> { /* ... */ }
     async searchEmails(oauth2Client: OAuth2Client, query: string): Promise<any> { /* ... */ }
     // etc.
   }
   ```

2. **Update Auth Middleware** (`backend/src/middleware/auth.middleware.ts`):
   ```typescript
   export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
     if (!req.session.userEmail) {
       return res.status(401).json({ error: 'Not authenticated' });
     }

     try {
       const user = await getUserByEmail(req.session.userEmail);
       if (!user) {
         return res.status(401).json({ error: 'User not found' });
       }

       // Create OAuth2Client for this user
       const oauth2Client = gmailService.createOAuth2Client(
         user.google_access_token,
         user.google_refresh_token
       );

       // Attach to request
       req.user = user;
       req.oauth2Client = oauth2Client;

       next();
     } catch (error) {
       console.error('Auth middleware error:', error);
       res.status(500).json({ error: 'Authentication failed' });
     }
   };
   ```

3. **Update Request Type** (`backend/src/types/index.ts` or in middleware file):
   ```typescript
   declare global {
     namespace Express {
       interface Request {
         user?: {
           email: string;
           google_access_token: string;
           google_refresh_token: string;
         };
         oauth2Client?: OAuth2Client;
       }
     }
   }
   ```

4. **Update All Routes** to use `req.oauth2Client`:
   - `backend/src/routes/flights.routes.ts`
   - `backend/src/routes/chat.routes.ts`

   Example:
   ```typescript
   // OLD: gmailService.setCredentials(accessToken, refreshToken);
   // NEW: Use req.oauth2Client from middleware

   router.post('/sync', requireAuth, async (req, res) => {
     try {
       const emails = await gmailService.searchEmails(
         req.oauth2Client!, // Passed from middleware
         'subject:flight OR subject:boarding pass'
       );
       // ...
     } catch (error) {
       // ...
     }
   });
   ```

**Benefit**: Each user has their own OAuth2Client instance, preventing credential collisions.

---

### Phase 3: Automatic Token Refresh

**Goal**: Automatically refresh expired access tokens using stored refresh tokens

**Steps**:

1. **Create Token Refresh Utility** (`backend/src/services/gmail.service.ts`):
   ```typescript
   async refreshAccessToken(oauth2Client: OAuth2Client, userEmail: string): Promise<string> {
     try {
       const { credentials } = await oauth2Client.refreshAccessToken();
       const newAccessToken = credentials.access_token!;

       // Update database with new access token
       await updateUserTokens(userEmail, newAccessToken, credentials.refresh_token);

       return newAccessToken;
     } catch (error) {
       console.error('Token refresh failed:', error);
       throw new Error('Failed to refresh access token');
     }
   }
   ```

2. **Add Error Handling Wrapper**:
   ```typescript
   async withTokenRefresh<T>(
     oauth2Client: OAuth2Client,
     userEmail: string,
     operation: () => Promise<T>
   ): Promise<T> {
     try {
       return await operation();
     } catch (error: any) {
       // Check if error is due to expired token
       if (error.code === 401 || error.code === 403) {
         console.log('Token expired, refreshing...');

         // Refresh token
         const newAccessToken = await this.refreshAccessToken(oauth2Client, userEmail);

         // Update OAuth2Client with new token
         oauth2Client.setCredentials({
           access_token: newAccessToken,
         });

         // Retry operation
         return await operation();
       }
       throw error;
     }
   }
   ```

3. **Update Gmail API Methods** to use wrapper:
   ```typescript
   async searchEmails(oauth2Client: OAuth2Client, query: string, userEmail: string): Promise<any> {
     return this.withTokenRefresh(oauth2Client, userEmail, async () => {
       const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
       const response = await gmail.users.messages.list({
         userId: 'me',
         q: query,
       });
       return response.data.messages || [];
     });
   }
   ```

**Benefit**: Access tokens are automatically refreshed when expired, providing seamless user experience.

---

### Phase 4: Session Restoration Testing

**Goal**: Verify that users remain authenticated after server restart

**Test Steps**:
1. User authenticates via OAuth flow
2. Verify tokens are saved to database
3. User makes API request successfully
4. Restart server
5. User makes API request with existing session cookie
6. Verify:
   - Session is restored from SQLite
   - Tokens are loaded from database
   - OAuth2Client is initialized with user's tokens
   - API request succeeds without re-authentication

---

## File Changes Summary

### Files to Modify:
1. `backend/package.json` - Add `connect-sqlite3` dependency
2. `backend/src/server.ts` - Configure persistent session store
3. `backend/src/services/gmail.service.ts` - Refactor for per-user OAuth2Client
4. `backend/src/middleware/auth.middleware.ts` - Create OAuth2Client per request
5. `backend/src/routes/flights.routes.ts` - Use `req.oauth2Client`
6. `backend/src/routes/chat.routes.ts` - Use `req.oauth2Client`
7. `backend/src/routes/auth.routes.ts` - Update to work with new GmailService structure

### Files to Create:
- `backend/src/types/express.d.ts` - Type definitions for Request extensions

---

## Migration Considerations

### Database
- No schema changes required
- Existing tokens in database will work immediately
- Sessions database will be created automatically by `connect-sqlite3`

### Environment Variables
- No new environment variables required
- Existing `.env` configuration remains valid

### Breaking Changes
- None for users (OAuth flow remains identical)
- API remains backward compatible

---

## Security Considerations

1. **Session Store Security**:
   - SQLite session database should not be committed to git
   - Add `backend/src/db/sessions.db` to `.gitignore`
   - Ensure proper file permissions in production

2. **Token Storage**:
   - Tokens are already encrypted at rest in SQLite
   - Consider encrypting tokens before storing (future enhancement)

3. **Session Cookie Security**:
   - Already configured with `httpOnly: true`
   - HTTPS enforced in production with `secure: true`
   - Consider adding `sameSite: 'strict'` for CSRF protection

---

## Testing Checklist

- [ ] User can authenticate via OAuth flow
- [ ] Tokens are saved to database
- [ ] User can make authenticated requests
- [ ] Session persists after server restart
- [ ] User remains authenticated after server restart
- [ ] Multiple users can be authenticated simultaneously
- [ ] User A's credentials don't affect User B
- [ ] Expired tokens are automatically refreshed
- [ ] Database is updated with refreshed tokens
- [ ] User can logout successfully
- [ ] Session is destroyed on logout

---

## Future Enhancements

1. **Token Encryption**: Encrypt tokens before storing in database
2. **Refresh Token Rotation**: Implement refresh token rotation for enhanced security
3. **Redis Session Store**: For horizontal scaling, consider Redis instead of SQLite
4. **Token Revocation**: Add ability to revoke tokens and force re-authentication
5. **Multi-Provider Auth**: Support additional OAuth providers (Microsoft, etc.)

---

## References

- Express Session Documentation: https://github.com/expressjs/session
- connect-sqlite3: https://github.com/rawberg/connect-sqlite3
- Google OAuth2 API: https://developers.google.com/identity/protocols/oauth2
- OAuth2Client Refresh: https://github.com/googleapis/google-api-nodejs-client#oauth2-client

---

## Questions / Decisions

- **Session Duration**: Currently 24 hours. Should this be configurable?
- **Concurrent Sessions**: Should users be able to have multiple active sessions?
- **Token Cleanup**: Should expired/unused tokens be cleaned up periodically?
- **Monitoring**: Should token refresh events be logged for monitoring?

---

**Last Updated**: 2025-11-01
**Status**: Planning Complete - Ready for Implementation
