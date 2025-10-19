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
      return flights;
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
      return flights;
    }

    case 'getAirlineStats': {
      const stats = db.getAirlineStats(userEmail);
      console.log(`   Found stats for ${stats.length} airlines`);
      return stats;
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
  message: string;
  toolCalls?: Array<{
    tool: string;
    arguments: any;
    result: any;
  }>;
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
      content: `You are a helpful assistant that helps users query their flight history.
You have access to tools that can retrieve flight data from the user's database.
Be conversational, friendly, and concise in your responses.
When displaying flight information, format it in a clear, readable way.
Today's date is ${new Date().toISOString().split('T')[0]}.`,
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
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-2024-08-06',
    messages,
    tools: flightTools,
    tool_choice: 'auto',
    temperature: 0.7,
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
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-2024-08-06',
      messages,
      tools: flightTools,
      tool_choice: 'auto',
      temperature: 0.7,
    });
  }

  // Get final assistant message
  const finalMessage = response.choices[0]?.message?.content ?? 'Sorry, I could not process your request.';

  console.log(`\n✅ Chat response: "${finalMessage.substring(0, 100)}..."\n`);

  return {
    message: finalMessage,
    toolCalls: toolCallsInfo.length > 0 ? toolCallsInfo : undefined,
  };
}
