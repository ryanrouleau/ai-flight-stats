import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionToolMessageParam } from 'openai/resources/chat/completions';
import { flightTools, type ToolName, type ToolArguments } from '../tools/flight-tools';
import * as db from './db.service';

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

// Shared defaults for chat completion requests
const CHAT_COMPLETION_DEFAULTS = {
  model: 'gpt-5-mini',
  tools: flightTools,
  tool_choice: 'auto' as const,
  temperature: 1,
  reasoning_effort: 'low'
} satisfies Omit<OpenAI.ChatCompletionCreateParams, 'messages'>;

const SYSTEM_PROMPT = `You are a friendly, helpful, casual, upbeat assistant that helps users query their flight history.
You have access to tools that can retrieve flight data from the user's database.
Be conversational, friendly, and concise in your responses.

When displaying flight information:
- For a single flight: Use a clean bulleted list with **bold labels** (e.g., **Date:** )
- For multiple flights: Use a markdown table with columns: Date | Airline | Flight | Route | Times | Cabin | Confirmation
- Format dates so they're human readable
- Format routes as: Origin → Destination (CODE → CODE)
- Always bold field labels like **Date:**, **Flight:**, **Route:**, **Times:**, **Cabin:**, **Confirmation:**, **Airline:** for easy scanning

Flight tool notes:
- Flight records returned from tools include \`email_message_id\` and \`emailMessageId\`. Use those identifiers in follow-up tool calls instead of asking the user.
- When a user explicitly asks to see the original email content or attachments, call \`getEmailBodies\` with the relevant Gmail message IDs rather than asking the user to look them up.

Today's date is ${new Date().toISOString().split('T')[0]}.

After your conversational answer, append a <globe_focus>...</globe_focus> block containing JSON that describes what should be highlighted on the globe visualization. The JSON must have this shape:
{
  "mode": "all" | "flights" | "airports",
  "flights": [SanitizedFlight, ...],
  "airports": [{"code": "SFO", "city": "San Francisco"}, ...]
}
- Use "all" when the default full dataset should be shown.
- Use "flights" when highlighting specific flights; include the exact sanitized flight objects from the latest tool results that match the user's reply (include coordinates if available).
- Use "airports" when only airport points should be highlighted; include airport codes and optional city names.
- Do not include any extra text inside the <globe_focus> block and ensure the JSON is valid.

ONLY offer follow ups that can be completed with the limited list of tools available.
`

type SanitizedFlight = Omit<db.Flight, 'raw_email_content'> & {
  emailMessageId?: string;
  emailSentDate?: string;
  emailSubject?: string;
};

type GlobeFocusMode = 'all' | 'flights' | 'airports';

export interface GlobeFocusPayload {
  mode: GlobeFocusMode;
  flights?: SanitizedFlight[];
  airports?: Array<{ code: string; city?: string | null }>;
}

function isValidGlobeFocusMode(mode: unknown): mode is GlobeFocusMode {
  return mode === 'all' || mode === 'flights' || mode === 'airports';
}

function sanitizeAirportEntry(entry: any): { code: string; city?: string | null } | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const code = typeof entry.code === 'string'
    ? entry.code
    : typeof entry.airport === 'string'
      ? entry.airport
      : null;

  if (!code) {
    return null;
  }

  const city =
    typeof entry.city === 'string'
      ? entry.city
      : typeof entry.name === 'string'
        ? entry.name
        : undefined;

  return { code, city: city ?? null };
}

function sanitizeFlightEntry(entry: any): SanitizedFlight | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const flight = entry as Partial<SanitizedFlight>;

  if (
    typeof flight.departure_airport !== 'string' ||
    typeof flight.arrival_airport !== 'string' ||
    typeof flight.flight_date !== 'string'
  ) {
    return null;
  }

  return {
    ...flight,
  } as SanitizedFlight;
}

function parseGlobeFocusBlock(content: string): { cleanedContent: string; focus?: GlobeFocusPayload } {
  const focusRegex = /<globe_focus>([\s\S]*?)<\/globe_focus>/i;
  const match = focusRegex.exec(content);

  if (!match) {
    return { cleanedContent: content };
  }

  const jsonText = match[1].trim();
  let focus: GlobeFocusPayload | undefined;

  try {
    const parsed = JSON.parse(jsonText);

    if (parsed && typeof parsed === 'object' && isValidGlobeFocusMode(parsed.mode)) {
      const sanitized: GlobeFocusPayload = { mode: parsed.mode };

      if (parsed.mode === 'flights' && Array.isArray(parsed.flights)) {
        const flights = parsed.flights
          .map(sanitizeFlightEntry)
          .filter((flight): flight is SanitizedFlight => flight !== null);
        if (flights.length > 0) {
          sanitized.flights = flights;
        }
      }

      if (parsed.mode === 'airports' && Array.isArray(parsed.airports)) {
        const airports = parsed.airports
          .map(sanitizeAirportEntry)
          .filter((airport): airport is { code: string; city?: string | null } => airport !== null)
          .map((airport) => ({
            code: airport.code.toUpperCase(),
            city: airport.city ?? null,
          }));
        if (airports.length > 0) {
          sanitized.airports = airports;
        }
      }

      focus = sanitized;
    }
  } catch (error) {
    console.warn('⚠️  Failed to parse globe focus JSON:', error);
  }

  const cleanedContent = `${content.slice(0, match.index)}${content.slice(match.index + match[0].length)}`.trim();

  return { cleanedContent, focus };
}

function sanitizeFlightRecord(flight: db.Flight): SanitizedFlight {
  const { raw_email_content, ...safeFlight } = flight;
  return {
    ...safeFlight,
    emailMessageId: flight.email_message_id ?? undefined,
    emailSentDate: flight.email_sent_date ?? undefined,
    emailSubject: flight.email_subject ?? undefined,
  };
}

/**
 * Execute a tool function call
 */
function executeTool(
  toolName: string,
  args: any,
  userEmail: string
): any {
  console.log(`🔧 Executing tool: ${toolName} with args:`, args);

  switch (toolName as ToolName) {
    case 'getFlightsByDateRange': {
      const { startDate, endDate } = args as ToolArguments['getFlightsByDateRange'];
      const flights = db.getFlightsByDateRange(userEmail, startDate, endDate);
      console.log(`   Found ${flights.length} flights between ${startDate} and ${endDate}`);
      return flights.map(sanitizeFlightRecord);
    }

    case 'getAirportVisits': {
      const { year } = args as ToolArguments['getAirportVisits'];
      const airports = db.getAirportVisits(userEmail, year);
      console.log(`   Found ${airports.length} unique airports${year ? ` in ${year}` : ''}`);
      return airports;
    }

    case 'getTotalFlights': {
      const { year } = args as ToolArguments['getTotalFlights'];
      const count = db.getTotalFlights(userEmail, year);
      console.log(`   Total flights: ${count}${year ? ` in ${year}` : ''}`);
      return { total: count, year: year ?? 'all time' };
    }

    case 'getFlightsByAirport': {
      const { airportCode } = args as ToolArguments['getFlightsByAirport'];
      const flights = db.getFlightsByAirport(userEmail, airportCode.toUpperCase());
      console.log(`   Found ${flights.length} flights for airport ${airportCode}`);
      return flights.map(sanitizeFlightRecord);
    }

    case 'getAirlineStats': {
      const stats = db.getAirlineStats(userEmail);
      console.log(`   Found stats for ${stats.length} airlines`);
      return stats;
    }

    case 'getEmailBodies': {
      const { emailMessageIds } = args as ToolArguments['getEmailBodies'];
      const emailBodies = db.getEmailBodies(userEmail, emailMessageIds).map(body => ({
        ...body,
        emailMessageId: body.email_message_id,
        emailSubject: body.email_subject ?? undefined,
        emailSentDate: body.email_sent_date ?? undefined,
      }));
      console.log(`   Returning ${emailBodies.length} email bodies`);
      return emailBodies;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Chat with the assistant using OpenAI with tool calling
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  message: ChatMessage;
  toolCalls?: Array<{
    tool: string;
    arguments: any;
    result: any;
  }>;
  globeFocus?: GlobeFocusPayload;
}

export async function chat(
  request: ChatRequest,
  userEmail: string
): Promise<ChatResponse> {
  console.log(`\n💬 Chat request from ${userEmail}: "${request.message}"\n`);

  // Build message history
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
  ];

  // Add conversation history if provided
  if (request.history && request.history.length > 0) {
    messages.push(
      ...request.history.map(msg => ({
        role: msg.role,
        content: msg.content,
      }))
    );
  }

  // Add current user message
  messages.push({
    role: 'user',
    content: request.message,
  });

  // Track tool calls for response
  const toolCallsInfo: Array<{
    tool: string;
    arguments: any;
    result: any;
  }> = [];

  // Tool calling loop - continue until no more tool calls
  let response = await getOpenAI().chat.completions.create({
    ...CHAT_COMPLETION_DEFAULTS,
    messages,
  });

  let iterations = 0;
  const maxIterations = 5; // Prevent infinite loops

  while (response.choices[0]?.finish_reason === 'tool_calls' && iterations < maxIterations) {
    iterations++;
    console.log(`\n🔄 Tool calling iteration ${iterations}\n`);

    const assistantMessage = response.choices[0].message;
    messages.push(assistantMessage);

    // Execute all tool calls
    const toolResults: ChatCompletionToolMessageParam[] = [];

    if (assistantMessage.tool_calls) {
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        // Execute the tool
        const result = executeTool(toolName, toolArgs, userEmail);

        // Track for response
        toolCallsInfo.push({
          tool: toolName,
          arguments: toolArgs,
          result,
        });

        // Add tool result to messages
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Add tool results to messages
    messages.push(...toolResults);

    // Get next response from OpenAI
    response = await getOpenAI().chat.completions.create({
      ...CHAT_COMPLETION_DEFAULTS,
      messages,
    });
  }

  // Get final assistant message
  const finalMessageRaw = response.choices[0]?.message?.content ?? 'Sorry, I could not process your request.';
  const { cleanedContent: finalMessageContent, focus: globeFocus } = parseGlobeFocusBlock(finalMessageRaw);

  console.log(`\n✅ Chat response: "${finalMessageContent.substring(0, 100)}..."\n`);

  return {
    message: {
      role: 'assistant',
      content: finalMessageContent,
    },
    toolCalls: toolCallsInfo.length > 0 ? toolCallsInfo : undefined,
    globeFocus,
  };
}
