import { env } from '../config/env.js';
import logger from '../config/logger.js';
import { fetchConfiguredCountryGdacsEvents } from './gdacsService.js';

export type ExternalDisasterSource = 'NewsAPI' | 'GDACS';

export interface ExternalDisasterItem {
  id: string;
  source: ExternalDisasterSource;
  title: string;
  disasterType: string;
  location: string;
  description: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  status: string;
}

export interface ExternalDisasterFeed {
  fetchedAt: string;
  country: string;
  items: ExternalDisasterItem[];
  sources: {
    newsApi: {
      enabled: boolean;
      itemCount: number;
      error: string;
    };
    gdacs: {
      enabled: boolean;
      itemCount: number;
      error: string;
    };
  };
}

const DISASTER_KEYWORDS = [
  'flood',
  'earthquake',
  'storm',
  'cyclone',
  'wildfire',
  'fire',
  'tsunami',
  'landslide',
  'drought',
  'epidemic',
  'outbreak',
  'cold wave',
];

const SRI_LANKA_LOCATIONS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya',
  'Galle', 'Matara', 'Hambantota', 'Jaffna', 'Kilinochchi', 'Mannar',
  'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla',
  'Monaragala', 'Ratnapura', 'Kegalle', 'Negombo', 'Kalmunai',
  'Peradeniya', 'Gampola', 'Dambulla', 'Hatton', 'Bandarawela', 'Balangoda',
];

interface NewsApiResponse {
  status?: string;
  articles?: Array<{
    title?: string;
    description?: string;
    url?: string;
    publishedAt?: string;
    source?: { name?: string };
  }>;
}

function getRecentIsoDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function isDisasterRelated(text: string): boolean {
  const normalized = normalizeText(text);
  return DISASTER_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function detectDisasterType(text: string): string {
  const normalized = normalizeText(text);
  const match = DISASTER_KEYWORDS.find((keyword) => normalized.includes(keyword));
  return match ?? 'disaster';
}

function detectLocation(text: string): string {
  const normalized = normalizeText(text);
  const countryName = env.externalIntelCountryName;

  if (normalized.includes(countryName.toLowerCase())) {
    return countryName;
  }

  const matches = SRI_LANKA_LOCATIONS.filter((location) =>
    normalized.includes(location.toLowerCase()),
  );

  return matches.length > 0 ? matches.join(', ') : countryName;
}

function compactDescription(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function itemKey(item: ExternalDisasterItem): string {
  return `${item.source}:${normalizeText(item.title)}:${item.publishedAt}`;
}

function buildNewsQuery(): string {
  const country = env.externalIntelCountryName;
  return [
    `${country} flood`,
    `${country} landslide`,
    `${country} cyclone`,
    `${country} earthquake`,
    `${country} drought`,
    `${country} tsunami`,
  ].join(' OR ');
}

function mockNewsDisasters(): ExternalDisasterItem[] {
  return [
    {
      id: `mock-news-${env.externalIntelCountryIso3.toLowerCase()}-flood`,
      source: 'NewsAPI',
      title: `Mock NewsAPI flood report in ${env.externalIntelCountryName}`,
      disasterType: 'flood',
      location: env.externalIntelCountryName,
      description: `Development mock news article used for testing external intelligence and credibility scoring in ${env.externalIntelCountryName}.`,
      url: 'https://newsapi.org/',
      publishedAt: new Date().toISOString(),
      sourceName: 'Mock NewsAPI',
      status: 'reported',
    },
  ];
}

async function fetchNewsDisasters(): Promise<{ items: ExternalDisasterItem[]; error: string }> {
  if (env.externalIntelMock) {
    return { items: mockNewsDisasters(), error: '' };
  }

  if (!env.newsApiKey) {
    return { items: [], error: 'NEWS_API_KEY is not configured' };
  }

  const query = encodeURIComponent(buildNewsQuery());
  const from = getRecentIsoDate(30);
  const url = [
    'https://newsapi.org/v2/everything',
    `?q=${query}`,
    '&language=en',
    '&sortBy=publishedAt',
    '&pageSize=20',
    `&from=${from}`,
    `&apiKey=${env.newsApiKey}`,
  ].join('');

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      return { items: [], error: `NewsAPI returned HTTP ${response.status}` };
    }

    const data = (await response.json()) as NewsApiResponse;
    const articles = data.articles ?? [];

    const items = articles
      .filter((article) => {
        const combinedText = `${article.title ?? ''} ${article.description ?? ''}`;
        return Boolean(article.title && article.url && isDisasterRelated(combinedText));
      })
      .map((article, index): ExternalDisasterItem => {
        const title = article.title ?? `${env.externalIntelCountryName} disaster update`;
        const combinedText = `${title} ${article.description ?? ''}`;

        return {
          id: `news-${index}-${Buffer.from(article.url ?? title).toString('base64url').slice(0, 12)}`,
          source: 'NewsAPI',
          title,
          disasterType: detectDisasterType(combinedText),
          location: detectLocation(combinedText),
          description: compactDescription(article.description ?? ''),
          url: article.url ?? '',
          publishedAt: article.publishedAt ?? new Date().toISOString(),
          sourceName: article.source?.name ?? 'News source',
          status: 'reported',
        };
      });

    return { items, error: '' };
  } catch (error) {
    logger.warn('Failed to fetch NewsAPI disaster intelligence', { error });
    return { items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchGdacsDisasters(): Promise<{ items: ExternalDisasterItem[]; error: string }> {
  try {
    const events = await fetchConfiguredCountryGdacsEvents();

    const items = events.map((event): ExternalDisasterItem => ({
      id: `gdacs-${event.id}`,
      source: 'GDACS',
      title: event.title,
      disasterType: event.disasterType,
      location: event.country || env.externalIntelCountryName,
      description: compactDescription(event.description || `${event.severity} ${event.population}`.trim()),
      url: event.url,
      publishedAt: event.publishedAt,
      sourceName: env.externalIntelMock ? 'Mock GDACS' : 'GDACS / EC-JRC',
      status: event.alertLevel,
    }));

    return { items, error: '' };
  } catch (error) {
    logger.warn('Failed to fetch GDACS disaster intelligence', { error });
    return { items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getExternalDisasterFeed(): Promise<ExternalDisasterFeed> {
  const [newsApi, gdacs] = await Promise.all([
    fetchNewsDisasters(),
    fetchGdacsDisasters(),
  ]);

  const seen = new Set<string>();
  const items = [...gdacs.items, ...newsApi.items]
    .filter((item) => {
      const key = itemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return {
    fetchedAt: new Date().toISOString(),
    country: env.externalIntelCountryName,
    items,
    sources: {
      newsApi: {
        enabled: env.externalIntelMock || Boolean(env.newsApiKey),
        itemCount: newsApi.items.length,
        error: newsApi.error,
      },
      gdacs: {
        enabled: true,
        itemCount: gdacs.items.length,
        error: gdacs.error,
      },
    },
  };
}