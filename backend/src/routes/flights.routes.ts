import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { gmailService } from '../services/gmail.service';
import { parseFlightEmail, type EmailInput } from '../services/parser.service';
import {
  createFlight,
  getFlightsByUser,
  findExactDuplicate,
  findFlightChange,
  deleteFlight,
  type Flight,
} from '../services/db.service';

const router = Router();

/**
 * POST /flights/scan
 * Scan Gmail for flight confirmation emails and parse them
 */
router.post('/scan', requireAuth, async (req: Request, res: Response) => {
  try {
    const userEmail = req.user?.email;
    const accessToken = req.user?.google_access_token;
    const refreshToken = req.user?.google_refresh_token;

    if (!userEmail || !accessToken || !refreshToken) {
      return res.status(401).json({
        error: 'User not authenticated or missing tokens',
      });
    }

    // Set Gmail credentials
    gmailService.setCredentials(accessToken, refreshToken);

    // Search for flight emails
    console.log(`🔍 Scanning emails for user: ${userEmail}`);
    const gmailMessages = await gmailService.searchFlightEmails();

    if (gmailMessages.length === 0) {
      return res.json({
        message: 'No flight emails found',
        scanned: 0,
        parsed: 0,
        flights: [],
      });
    }

    console.log(`📧 Found ${gmailMessages.length} potential flight emails`);

    // Fetch full email content for each message
    const emailInputs: EmailInput[] = await Promise.all(
      gmailMessages.map(async (msg) => {
        const content = await gmailService.getEmailContent(msg.id);
        return {
          id: msg.id,
          content,
          snippet: msg.snippet,
          subject: msg.subject,
          sentDate: msg.sentDate,
        };
      })
    );

    const parseEmailSentDate = (value?: string | null): number | undefined => {
      if (!value) {
        return undefined;
      }
      const timestamp = Date.parse(value);
      return Number.isNaN(timestamp) ? undefined : timestamp;
    };

    // Store flights in database
    const savedFlights: Flight[] = [];
    let parsedCount = 0;

    for (const emailInput of emailInputs) {
      const flightsFromEmail = await parseFlightEmail(emailInput);
      parsedCount += flightsFromEmail.length;

      for (const flight of flightsFromEmail) {
        const passengerNames = flight.passengerNames
          ? JSON.stringify(flight.passengerNames)
          : undefined;

        const flightRecord: Flight = {
          user_email: userEmail,
          confirmation_number: flight.confirmationNumber,
          flight_date: flight.flightDate,
          departure_time_local: flight.departureTimeLocal,
          arrival_time_local: flight.arrivalTimeLocal,
          departure_airport: flight.departureAirport,
          arrival_airport: flight.arrivalAirport,
          departure_city: flight.departureCity,
          arrival_city: flight.arrivalCity,
          airline: flight.airline,
          flight_number: flight.flightNumber,
          cabin: flight.cabin,
          passenger_names: passengerNames,
          notes: flight.notes,
          departure_lat: flight.departureLat,
          departure_lng: flight.departureLng,
          arrival_lat: flight.arrivalLat,
          arrival_lng: flight.arrivalLng,
          email_message_id: flight.emailMessageId,
          email_sent_date: flight.emailSentDate,
          email_subject: flight.emailSubject,
          raw_email_content: flight.rawEmailContent,
        };

        const exactDuplicate = findExactDuplicate(flightRecord);
        if (exactDuplicate) {
          console.log(
            `⚠️  Duplicate flight skipped: ${flightRecord.departure_airport} → ${flightRecord.arrival_airport} on ${flightRecord.flight_date}`
          );
          continue;
        }

        const existingFlights = findFlightChange(flightRecord);
        if (existingFlights.length > 0) {
          console.log(
            `🔄 Flight change detected for ${flightRecord.departure_airport} → ${flightRecord.arrival_airport} (${flightRecord.flight_number ?? 'unknown'})`
          );

          const newTimestamp = parseEmailSentDate(flightRecord.email_sent_date);
          const existingTimestamps = existingFlights
            .map(f => parseEmailSentDate(f.email_sent_date))
            .filter((value): value is number => value !== undefined);

          const shouldReplace =
            newTimestamp !== undefined
              ? existingTimestamps.length === 0 ||
                newTimestamp > Math.max(...existingTimestamps)
              : existingTimestamps.length === 0;

          if (shouldReplace) {
            for (const existing of existingFlights) {
              if (existing.id) {
                deleteFlight(existing.id);
                console.log(
                  `  🗑️  Removed outdated flight (${existing.flight_date}) with ID ${existing.id}`
                );
              }
            }
          } else {
            console.log(
              `  ⏭️  Skipped new flight from email dated ${flightRecord.email_sent_date ?? 'unknown'}`
            );
            continue;
          }
        }

        try {
          const savedFlight = createFlight(flightRecord);
          savedFlights.push(savedFlight);
        } catch (error: any) {
          // Skip duplicates (unique constraint violations)
          if (error.message?.includes('UNIQUE constraint failed')) {
            console.log(
              `⚠️  Duplicate flight skipped: ${flight.departureAirport} → ${flight.arrivalAirport} on ${flight.flightDate}`
            );
          } else {
            console.error('Error saving flight:', error);
          }
        }
      }
    }

    return res.json({
      message: `Successfully scanned ${gmailMessages.length} emails and parsed ${parsedCount} flights`,
      scanned: gmailMessages.length,
      parsed: parsedCount,
      saved: savedFlights.length,
      flights: savedFlights,
    });
  } catch (error: any) {
    console.error('❌ Error scanning flights:', error);
    return res.status(500).json({
      error: 'Failed to scan flights',
      details: error.message,
    });
  }
});

/**
 * GET /flights
 * Get all flights for authenticated user
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({
        error: 'User not authenticated',
      });
    }

    const flights = getFlightsByUser(userEmail);

    return res.json({
      count: flights.length,
      flights,
    });
  } catch (error: any) {
    console.error('❌ Error fetching flights:', error);
    return res.status(500).json({
      error: 'Failed to fetch flights',
      details: error.message,
    });
  }
});

export default router;
