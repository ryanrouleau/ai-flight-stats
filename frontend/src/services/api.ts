// Backend API client

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface Flight {
  id: number;
  user_email: string;
  confirmation_number?: string;
  flight_date: string;
  departure_airport: string;
  arrival_airport: string;
  departure_city?: string;
  arrival_city?: string;
  airline?: string;
  flight_number?: string;
  departure_lat?: number;
  departure_lng?: number;
  arrival_lat?: number;
  arrival_lng?: number;
  raw_email_snippet?: string;
  created_at: string;
}

export interface GlobeData {
  airports: {
    code: string;
    city: string;
    lat: number;
    lng: number;
    count: number;
  }[];
  flights: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    airline?: string;
    date: string;
  }[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: ChatMessage;
}

export interface AuthStatus {
  authenticated: boolean;
  user?: {
    email: string;
  };
}

export interface ScanResponse {
  count: number;
  message: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      credentials: 'include', // Include cookies for session management
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(errorData.message || `HTTP error ${response.status}`);
    }

    return response.json();
  }

  // Authentication endpoints
  async getAuthStatus(): Promise<AuthStatus> {
    return this.request<AuthStatus>('/auth/status');
  }

  getGoogleAuthUrl(): string {
    return `${this.baseUrl}/auth/google`;
  }

  async logout(): Promise<void> {
    return this.request<void>('/auth/logout', { method: 'POST' });
  }

  // Flight endpoints
  async scanEmails(): Promise<ScanResponse> {
    return this.request<ScanResponse>('/flights/scan', { method: 'POST' });
  }

  async getFlights(): Promise<Flight[]> {
    return this.request<Flight[]>('/flights');
  }

  async getGlobeData(): Promise<GlobeData> {
    return this.request<GlobeData>('/flights/globe-data');
  }

  // Chat endpoints
  async sendChatMessage(message: string, history: ChatMessage[] = []): Promise<ChatResponse> {
    return this.request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
