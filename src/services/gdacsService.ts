import logger from '../config/logger.js';

export interface GdacsEvent {
  id: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  eventType: string;
  disasterType: string;
  alertLevel: string;
  country: string;
  iso3: string;
  severity: string;
  population: string;
}

export interface GdacsMatchResult {
  found: boolean;
  title: string;
  url: string;
  alertLevel: string;
}

type GdacsFeatureCollection = {
  type?: string;
  features?: GdacsFeature[];
};

type GdacsFeature = {
  type?: string;
  properties?: GdacsFeatureProperties;
};

type GdacsFeatureProperties = {
  eventtype?: string;
  eventid?: number | string;
  episodeid?: number | string;
  eventname?: string;
  name?: string;
  description?: string;
  htmldescription?: string;
  alertlevel?: string;
  episodealertlevel?: string;
  country?: string;
  iso3?: string;
  fromdate?: string;
  todate?: string;
  datemodified?: string;
  Class?: string;
  polygonlabel?: string;
  url?: {
    report?: string;
    details?: string;
    geometry?: string;
  };
  affectedcountries?: Array<{
    iso2?: string;
    iso3?: string;
    countryname?: string;
  }>;
  severitydata?: {
    severity?: number;
    severitytext?: string;
    severityunit?: string;
  };
};

const GDACS_EVENTS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP';
const GDACS_EVENT_TYPES = 'EQ,TC,FL,VO,DR,WF';
const CACHE_TTL_MS = 5 * 60 * 1000;

const EVENT_TYPE_TO_DISASTER: Record<string, string> = {
  EQ: 'earthquake',
  TC: 'storm',
  FL: 'flood',
  WF: 'wildfire',
  VO: 'volcano',
  DR: 'drought',
};

const CRISIS_ALIASES: Record<string, string[]> = {
  flood: ['flood', 'flash flood'],
  earthquake: ['earthquake', 'seismic'],
  storm: ['storm', 'cyclone', 'tropical cyclone', 'typhoon'],
  wildfire: ['wildfire', 'forest fire', 'forest fires', 'fire'],
  tsunami: ['tsunami'],
  landslide: ['landslide', 'mudslide'],
  drought: ['drought'],
  epidemic: ['epidemic', 'outbreak'],
  volcano: ['volcano', 'eruption', 'volcanic'],
};

let cachedEvents: { expiresAt: number; events: GdacsEvent[] } | null = null;

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function eventKey(properties: GdacsFeatureProperties): string {
  return `${properties.eventtype ?? 'GDACS'}-${properties.eventid ?? properties.name ?? 'unknown'}`;
}

function mapEventType(eventType: string, text: string): string {
  const mapped = EVENT_TYPE_TO_DISASTER[eventType.toUpperCase()];
  if (mapped) return mapped;

  const normalized = normalizeText(text);
  for (const [type, aliases] of Object.entries(CRISIS_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias))) return type;
  }

  return 'disaster';
}

function isSriLankaFeature(properties: GdacsFeatureProperties): boolean {
  const affectedCountryText = (properties.affectedcountries ?? [])
    .map((country) => `${country.iso3 ?? ''} ${country.countryname ?? ''}`)
    .join(' ');

  const text = `${properties.iso3 ?? ''} ${properties.country ?? ''} ${affectedCountryText}`.toLowerCase();
  return text.includes('lka') || text.includes('sri lanka');
}

function featureRank(properties: GdacsFeatureProperties): number {
  const featureClass = normalizeText(properties.Class ?? '');
  const polygonLabel = normalizeText(properties.polygonlabel ?? '');

  if (featureClass.includes('centroid') || polygonLabel.includes('centroid')) return 3;
  if (featureClass.includes('affected') || polygonLabel.includes('affected')) return 2;
  return 1;
}

function featureToEvent(properties: GdacsFeatureProperties): GdacsEvent {
  const eventType = properties.eventtype ?? '';
  const title = properties.name || properties.description || `${mapEventType(eventType, '')} in ${properties.country ?? 'Unknown location'}`;
  const description = stripHtml(properties.htmldescription || properties.description || title);
  const severityText = properties.severitydata?.severitytext ?? '';
  const severityValue = properties.severitydata?.severity;
  const severityUnit = properties.severitydata?.severityunit ?? '';

  return {
    id: eventKey(properties),
    title,
    description,
    url: properties.url?.report ?? properties.url?.details ?? 'https://www.gdacs.org/',
    publishedAt: properties.datemodified ?? properties.fromdate ?? new Date().toISOString(),
    eventType,
    disasterType: mapEventType(eventType, `${title} ${description}`),
    alertLevel: properties.alertlevel ?? properties.episodealertlevel ?? 'Unknown',
    country: properties.country ?? 'Unknown',
    iso3: properties.iso3 ?? '',
    severity: severityText || (severityValue !== undefined ? `${severityValue} ${severityUnit}`.trim() : ''),
    population: '',
  };
}

function parseGdacsEvents(data: unknown): GdacsEvent[] {
  const collection = data as GdacsFeatureCollection;
  const features = Array.isArray(collection.features) ? collection.features : [];
  const byEventId = new Map<string, { rank: number; event: GdacsEvent }>();

  for (const feature of features) {
    const properties = feature.properties;
    if (!properties || !isSriLankaFeature(properties)) continue;

    const key = eventKey(properties);
    const rank = featureRank(properties);
    const existing = byEventId.get(key);

    if (!existing || rank > existing.rank) {
      byEventId.set(key, {
        rank,
        event: featureToEvent(properties),
      });
    }
  }

  return Array.from(byEventId.values())
    .map((entry) => entry.event)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function crisisMatches(event: GdacsEvent, crisisType: string): boolean {
  const normalizedCrisisType = normalizeText(crisisType);
  const aliases = CRISIS_ALIASES[normalizedCrisisType] ?? [normalizedCrisisType];
  const text = `${event.disasterType} ${event.eventType} ${event.title} ${event.description}`.toLowerCase();

  return aliases.some((alias) => text.includes(alias));
}

function locationMatches(event: GdacsEvent, locations: string[]): boolean {
  if (locations.length === 0) return true;

  const text = `${event.iso3} ${event.country} ${event.title} ${event.description}`.toLowerCase();
  return (
    text.includes('sri lanka') ||
    text.includes('lka') ||
    locations.some((location) => text.includes(normalizeText(location)))
  );
}

export async function fetchGdacsEvents(): Promise<GdacsEvent[]> {
  if (cachedEvents && cachedEvents.expiresAt > Date.now()) {
    return cachedEvents.events;
  }

  const url = `${GDACS_EVENTS_URL}?eventtype=${encodeURIComponent(GDACS_EVENT_TYPES)}`;

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      logger.warn('GDACS API request failed', { status: response.status });
      return [];
    }

    const data: unknown = await response.json();
    const events = parseGdacsEvents(data);

    cachedEvents = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      events,
    };

    return events;
  } catch (error) {
    logger.warn('Failed to fetch GDACS disaster feed', { error });
    return [];
  }
}

export async function fetchSriLankaGdacsEvents(): Promise<GdacsEvent[]> {
  return fetchGdacsEvents();
}

export async function checkGdacsMatch(
  crisisType: string,
  locations: string[],
): Promise<GdacsMatchResult> {
  const events = await fetchSriLankaGdacsEvents();
  const match = events.find(
    (event) => crisisMatches(event, crisisType) && locationMatches(event, locations),
  );

  return {
    found: Boolean(match),
    title: match?.title ?? '',
    url: match?.url ?? '',
    alertLevel: match?.alertLevel ?? '',
  };
}