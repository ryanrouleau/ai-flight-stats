import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * OpenAI function tool definitions for flight queries
 * These tools are available to the LLM during chat conversations
 */

export const flightTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getFlightsByDateRange',
      description: 'Get all flights within a specific date range. Use this when the user asks about flights during a specific period, between dates, or mentions time ranges like "last year", "in 2023", etc.',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format (inclusive)',
          },
          endDate: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format (inclusive)',
          },
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAirportVisits',
      description: 'Get a list of unique airports the user has visited (departed from or arrived at). Returns airport codes and city names. Optionally filter by year.',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'number',
            description: 'Optional year to filter by (e.g., 2023, 2024). If not provided, returns all airports ever visited.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTotalFlights',
      description: 'Count the total number of flights. Optionally filter by year. Use this when the user asks "how many flights", "total flights", etc.',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'number',
            description: 'Optional year to filter by (e.g., 2023, 2024). If not provided, returns total across all time.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getFlightsByAirport',
      description: 'Get all flights that either departed from or arrived at a specific airport. Use when the user asks about a specific airport, city, or airport code.',
      parameters: {
        type: 'object',
        properties: {
          airportCode: {
            type: 'string',
            description: 'Three-letter IATA airport code (e.g., SFO, JFK, LAX). Must be uppercase.',
          },
        },
        required: ['airportCode'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAirlineStats',
      description: 'Get statistics showing how many flights were taken on each airline. Returns airline names and flight counts, sorted by frequency. Use when the user asks about airlines, favorite carriers, or flight distribution.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getEmailBodies',
      description: 'Retrieve the full email bodies for specific flight confirmation emails.',
      parameters: {
        type: 'object',
        properties: {
          emailMessageIds: {
            type: 'array',
            description: 'List of Gmail message IDs to retrieve the raw email bodies for.',
            items: {
              type: 'string',
            },
            minItems: 1,
          },
        },
        required: ['emailMessageIds'],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Type for tool function names
 */
export type ToolName =
  | 'getFlightsByDateRange'
  | 'getAirportVisits'
  | 'getTotalFlights'
  | 'getFlightsByAirport'
  | 'getAirlineStats'
  | 'getEmailBodies';

/**
 * Type for tool call arguments
 */
export interface ToolArguments {
  getFlightsByDateRange: {
    startDate: string;
    endDate: string;
  };
  getAirportVisits: {
    year?: number;
  };
  getTotalFlights: {
    year?: number;
  };
  getFlightsByAirport: {
    airportCode: string;
  };
  getAirlineStats: Record<string, never>;
  getEmailBodies: {
    emailMessageIds: string[];
  };
}
