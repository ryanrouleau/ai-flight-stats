import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

interface GmailMessage {
  id: string;
  snippet: string;
  internalDate: string;
}

class GmailService {
  private _oauth2Client?: OAuth2Client;

  /**
   * Get or create OAuth2Client (lazy initialization)
   */
  private get oauth2Client(): OAuth2Client {
    if (!this._oauth2Client) {
      this._oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
    }
    return this._oauth2Client;
  }

  /**
   * Get OAuth2 authorization URL
   */
  getAuthUrl(): string {
    const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent to get refresh token
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { tokens } = await this.oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
    };
  }

  /**
   * Set credentials for the OAuth2 client
   */
  setCredentials(accessToken: string, refreshToken: string): void {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  /**
   * Get user's email address
   */
  async getUserEmail(): Promise<string> {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return profile.data.emailAddress || '';
  }

  /**
   * Search Gmail for flight confirmation emails
   */
  async searchFlightEmails(): Promise<GmailMessage[]> {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    // Enhanced search query for flight-related emails
    const query = '(subject:(flight itinerary OR flight confirmation OR e-ticket OR boarding pass) OR "confirmation number" OR "booking reference" OR "PNR") ("flight number" OR "gate" OR "terminal" OR "boarding time") -hotel -accommodation -"hotel confirmation" -resort -unsubscribe';

    try {
      // Get list of message IDs
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50, // Limit to 50 for POC
      });

      const messages = response.data.messages || [];

      if (messages.length === 0) {
        return [];
      }

      // Fetch full message details for each message
      const messageDetails = await Promise.all(
        messages.map(async (message) => {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full',
          });

          return {
            id: detail.data.id!,
            snippet: detail.data.snippet || '',
            internalDate: detail.data.internalDate || '',
          };
        })
      );

      return messageDetails;
    } catch (error) {
      console.error('Error searching Gmail:', error);
      throw new Error('Failed to search Gmail');
    }
  }

  /**
   * Get full email content by message ID
   */
  async getEmailContent(messageId: string): Promise<string> {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    try {
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      // Extract email body from payload
      const payload = message.data.payload;
      let emailBody = '';

      // Helper function to decode base64url
      const decodeBase64 = (data: string): string => {
        return Buffer.from(data, 'base64url').toString('utf-8');
      };

      // Try to get body from different parts
      if (payload?.body?.data) {
        emailBody = decodeBase64(payload.body.data);
      } else if (payload?.parts) {
        // Look for text/plain or text/html parts
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            emailBody = decodeBase64(part.body.data);
            break;
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            emailBody = decodeBase64(part.body.data);
          }
        }
      }

      // If we still don't have body, use snippet
      if (!emailBody) {
        emailBody = message.data.snippet || '';
      }

      return emailBody;
    } catch (error) {
      console.error('Error getting email content:', error);
      throw new Error('Failed to get email content');
    }
  }

  /**
   * Refresh access token if expired
   */
  async refreshAccessToken(): Promise<string> {
    const { credentials } = await this.oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token');
    }

    return credentials.access_token;
  }
}

export const gmailService = new GmailService();
