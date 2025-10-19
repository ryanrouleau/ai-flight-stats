import fs from 'fs';
import path from 'path';

export interface Airport {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

class AirportService {
  private airports: Map<string, Airport> = new Map();

  constructor() {
    this.loadAirports();
  }

  private loadAirports(): void {
    try {
      const csvPath = path.join(__dirname, '../data/airports.csv');
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.split('\n');

      // Skip header row
      const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

      // Find column indices
      const iataIndex = header.indexOf('iata_code');
      const nameIndex = header.indexOf('name');
      const cityIndex = header.indexOf('municipality');
      const countryIndex = header.indexOf('iso_country');
      const latIndex = header.indexOf('latitude_deg');
      const lngIndex = header.indexOf('longitude_deg');

      let airportCount = 0;

      // Parse each line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple CSV parsing (handles quoted fields)
        const fields = this.parseCSVLine(line);

        const iataCode = fields[iataIndex]?.replace(/"/g, '').trim();

        // Only include airports with IATA codes
        if (!iataCode || iataCode === '') continue;

        const airport: Airport = {
          iataCode,
          name: fields[nameIndex]?.replace(/"/g, '').trim() || '',
          city: fields[cityIndex]?.replace(/"/g, '').trim() || '',
          country: fields[countryIndex]?.replace(/"/g, '').trim() || '',
          latitude: parseFloat(fields[latIndex]) || 0,
          longitude: parseFloat(fields[lngIndex]) || 0,
        };

        this.airports.set(iataCode.toUpperCase(), airport);
        airportCount++;
      }

      console.log(`✈️  Loaded ${airportCount} airports with IATA codes`);
    } catch (error) {
      console.error('❌ Error loading airports:', error);
      throw error;
    }
  }

  private parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }

    // Add last field
    fields.push(currentField);

    return fields;
  }

  /**
   * Get airport details by IATA code
   */
  getAirportByCode(iataCode: string): Airport | null {
    const airport = this.airports.get(iataCode.toUpperCase());
    return airport || null;
  }
}

// Export singleton instance
export const airportService = new AirportService();
