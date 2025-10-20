import OpenAI from 'openai';
import { airportService } from './airport.service';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

// Lazy-initialize OpenAI client
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// Enhanced Zod schema with times, cabin, and metadata
const FlightSegmentSchema = z.object({
  confirmationNumber: z
    .string()
    .regex(/^[A-Z0-9]{5,8}$/i)
    .nullish()
    .describe('PNR/record locator (5-8 alphanumeric chars)'),
  flightDateLocal: z.string().describe('YYYY-MM-DD on departure airport local date'),
  departureTimeLocal: z.string().nullish().describe('HH:mm 24h format, departure local time'),
  arrivalTimeLocal: z.string().nullish().describe('HH:mm 24h format, arrival local time'),
  departureAirport: z.string().length(3).describe('3-letter IATA departure airport code'),
  arrivalAirport: z.string().length(3).describe('3-letter IATA arrival airport code'),
  airline: z.string().nullish().describe('Airline name'),
  flightNumber: z.string().nullish().describe('Flight number (e.g., UA123, AA456)'),
  cabin: z.string().nullish().describe('Cabin class (economy, business, first, etc.)'),
  passengerNames: z.array(z.string()).nullish().describe('Passenger names if present'),
  notes: z.string().nullish().describe('Any additional notes or special information'),
});

const FlightExtractionSchema = z.object({
  flights: z
    .array(FlightSegmentSchema)
    .describe('All flight segments (connections, round trips, etc.)'),
  isValid: z.boolean().describe('False if no clear flight information found'),
  emailMetadata: z
    .object({
      messageId: z.string().nullable(),
      subject: z.string().nullable(),
      sentDate: z.string().nullable().describe('ISO8601 date'),
    })
    .nullable(),
});

export interface ParsedFlight {
  confirmationNumber?: string;
  flightDate: string;
  departureTimeLocal?: string;
  arrivalTimeLocal?: string;
  departureAirport: string;
  arrivalAirport: string;
  airline?: string;
  flightNumber?: string;
  cabin?: string;
  passengerNames?: string[];
  notes?: string;
  departureCity?: string;
  arrivalCity?: string;
  departureLat?: number;
  departureLng?: number;
  arrivalLat?: number;
  arrivalLng?: number;
  emailMessageId?: string;
  emailSentDate?: string;
  emailSubject?: string;
  rawEmailContent?: string;
}

export interface EmailInput {
  id: string;
  content: string;
  snippet: string;
  subject?: string;
  sentDate?: string;
}

/**
 * Clean HTML content and convert to readable plaintext
 */
function cleanEmailContent(content: string): string {
  // Check if content is HTML
  if (!content.includes('<html') && !content.includes('<body')) {
    // Already plaintext, just clean up
    return content.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Parse HTML and extract text
  const $ = cheerio.load(content);

  // Remove script and style elements
  $('script, style').remove();

  // Get text content
  let text = $('body').text();

  // If no body, get all text
  if (!text) {
    text = $.text();
  }

  // Clean up whitespace
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Limit to ~50k chars to avoid token bloat
  if (text.length > 50000) {
    text = text.substring(0, 50000) + '\n[... content truncated ...]';
  }

  return text;
}

/**
 * Normalize a flight segment after LLM extraction
 */
function normalizeFlight(
  seg: z.infer<typeof FlightSegmentSchema>
): ParsedFlight | null {
  const iata = (s?: string) => (s ?? '').trim().toUpperCase();
  const code = iata(seg.departureAirport);
  const arr = iata(seg.arrivalAirport);

  // Drop obviously bad IATA codes
  if (code.length !== 3 || arr.length !== 3) {
    console.log(`⚠️  Invalid IATA codes: ${code} → ${arr}`);
    return null;
  }

  // Validate airport existence
  const dep = airportService.getAirportByCode(code);
  const dst = airportService.getAirportByCode(arr);

  if (!dep) {
    console.log(`⚠️  Departure airport ${code} not found in database`);
    return null;
  }

  if (!dst) {
    console.log(`⚠️  Arrival airport ${arr} not found in database`);
    return null;
  }

  // Normalize airline and flight number
  const airlineNorm = seg.airline?.trim();
  const flightNo = seg.flightNumber?.replace(/\s+/g, '').toUpperCase();
  const pnr = seg.confirmationNumber?.toUpperCase();

  return {
    confirmationNumber: pnr,
    flightDate: seg.flightDateLocal,
    departureTimeLocal: seg.departureTimeLocal ?? undefined,
    arrivalTimeLocal: seg.arrivalTimeLocal ?? undefined,
    departureAirport: code,
    arrivalAirport: arr,
    airline: airlineNorm,
    flightNumber: flightNo,
    cabin: seg.cabin ?? undefined,
    passengerNames: seg.passengerNames ?? undefined,
    notes: seg.notes ?? undefined,
    departureCity: dep.city,
    arrivalCity: dst.city,
    departureLat: dep.latitude,
    departureLng: dep.longitude,
    arrivalLat: dst.latitude,
    arrivalLng: dst.longitude,
  };
}

/**
 * Parse flight information from email content using OpenAI Structured Outputs
 */
export async function parseFlightEmail(email: EmailInput): Promise<ParsedFlight[]> {
  try {
    // Clean email content (HTML -> plaintext)
    const cleanedContent = cleanEmailContent(email.content);

    // Build prompt with metadata
    const prompt = `You extract flight segments from airline confirmations.

Rules:
- If a field isn't present, return null
- Use the departure airport's local calendar day for flightDateLocal
- If an airport code is not found, use the best guess for the city
- Extract ALL flight segments including connections and round trips
- Use 24-hour time format (HH:mm) for times

Email Metadata:
Subject: ${email.subject ?? 'N/A'}
Snippet: ${email.snippet}
Sent: ${email.sentDate ?? 'N/A'}
Message ID: ${email.id}

Email Content:
${cleanedContent}

Extract all flight information from this email.`;

    const response = await getOpenAI().beta.chat.completions.parse({
      model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at extracting structured flight information from emails. Extract ALL flight segments including connections and round trips. Always use ISO 8601 date format (YYYY-MM-DD) for dates. Set isValid to false if no clear flight information is found. Do not invent data.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: zodResponseFormat(FlightExtractionSchema, 'flight_extraction'),
      temperature: 1,
    });

    const parsed = response.choices[0]?.message?.parsed;

    if (!parsed || !parsed.isValid || parsed.flights.length === 0) {
      console.log(`⚠️  No valid flight information found in email ${email.id}`);
      return [];
    }

    // Normalize each flight segment
    const normalized = parsed.flights
      .map(normalizeFlight)
      .filter((f): f is ParsedFlight => f !== null);

    const metadata = parsed.emailMetadata ?? null;
    const messageId = metadata?.messageId ?? email.id ?? null;
    const subject = metadata?.subject ?? email.subject ?? null;
    const sentDate = metadata?.sentDate ?? email.sentDate ?? null;

    const enrichedFlights = normalized.map(flight => ({
      ...flight,
      emailMessageId: messageId ?? undefined,
      emailSubject: subject ?? undefined,
      emailSentDate: sentDate ?? undefined,
      rawEmailContent: email.content,
    }));

    // Log parsed flights
    for (const flight of enrichedFlights) {
      console.log(
        `✅ Parsed: ${flight.departureAirport} → ${flight.arrivalAirport} on ${flight.flightDate}${flight.flightNumber ? ` (${flight.flightNumber})` : ''}`
      );
    }

    return enrichedFlights;
  } catch (error) {
    console.error(`❌ Error parsing email ${email.id}:`, error);
    return [];
  }
}

/**
 * Retry wrapper with exponential backoff
 */
async function retry<T>(
  fn: () => Promise<T>,
  options: { retries: number; delay: number } = { retries: 3, delay: 1000 }
): Promise<T> {
  let lastError: any;

  for (let i = 0; i <= options.retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable (429, 5xx)
      const isRetryable =
        error?.status === 429 ||
        (error?.status >= 500 && error?.status < 600) ||
        error?.code === 'ECONNRESET';

      if (!isRetryable || i === options.retries) {
        throw error;
      }

      // Exponential backoff
      const delay = options.delay * Math.pow(2, i);
      console.log(`⚠️  Retrying after ${delay}ms (attempt ${i + 1}/${options.retries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Parse multiple flights from a batch of emails with concurrency control
 */
export async function parseFlightEmails(emails: EmailInput[]): Promise<ParsedFlight[]> {
  console.log(`\n🔍 Parsing ${emails.length} emails with concurrency control...\n`);

  // Limit concurrency to avoid rate limits
  const limit = pLimit(3);

  // Process emails in parallel with retry logic
  const flightsArrays = await Promise.all(
    emails.map(email =>
      limit(() =>
        retry(() => parseFlightEmail(email), { retries: 3, delay: 1000 })
      )
    )
  );

  const allFlights = flightsArrays.flat();

  console.log(
    `\n✅ Successfully parsed ${allFlights.length} flight segments from ${emails.length} emails\n`
  );

  return allFlights;
}
