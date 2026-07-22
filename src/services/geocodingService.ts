/**
 * Geocoding Service — Nominatim (OpenStreetMap)
 *
 * Converts place name strings extracted by the AI service into
 * latitude/longitude coordinates. Nominatim is completely free,
 * requires no API key, and handles Sri Lankan place names well.
 *
 * Usage policy: one request at a time, 1 second between requests.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

// Adding "Sri Lanka" as a country hint improves accuracy for local place names.
// For a global system remove this, or make it configurable via env.
const COUNTRY_HINT = 'Sri Lanka';

const HEADERS = {
  // Nominatim requires a descriptive User-Agent identifying your app.
  'User-Agent': 'MCMS-DisasterManagement/1.0 (university-project)',
  Accept: 'application/json',
};

export interface GeoLocation {
  name: string;         // original place name from AI extraction
  lat: number;
  lng: number;
  displayName: string;  // full address string returned by Nominatim
  source: string;       // "spacy_ner" or "gazetteer" — passed through from AI
}

/**
 * Geocode a single place name. Returns null if Nominatim finds no match.
 */
async function geocodeSingle(
  placeName: string,
  source: string,
): Promise<GeoLocation | null> {
  const params = new URLSearchParams({
    q      : `${placeName}, ${COUNTRY_HINT}`,
    format : 'json',
    limit  : '1',
  });

  const url = `${NOMINATIM_BASE}?${params.toString()}`;

  try {
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      console.warn(`[Geocoding] Nominatim returned ${response.status} for "${placeName}"`);
      return null;
    }

    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;

    if (!results.length) {
      console.warn(`[Geocoding] No result for "${placeName}"`);
      return null;
    }

    const top = results[0];
    if (!top) {
      return null;
    }

    return {
      name       : placeName,
      lat        : parseFloat(top.lat),
      lng        : parseFloat(top.lon),
      displayName: top.display_name,
      source,
    };
  } catch (error) {
    console.error(`[Geocoding] Error for "${placeName}":`, error);
    return null;
  }
}

/**
 * Sleep helper — required to respect Nominatim's 1 req/sec rate limit.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Geocode multiple place names sequentially (respects Nominatim rate limit).
 * Places that cannot be resolved are silently skipped.
 */
export async function geocodeLocations(
  locations: Array<{ text: string; source: string }>,
): Promise<GeoLocation[]> {
  const results: GeoLocation[] = [];

  for (const [i, location] of locations.entries()) {
    const { text, source } = location;
    const geo = await geocodeSingle(text, source);

    if (geo) {
      results.push(geo);
    }

    // Respect Nominatim's rate limit — 1 request per second
    if (i < locations.length - 1) {
      await sleep(1100);
    }
  }

  return results;
}
