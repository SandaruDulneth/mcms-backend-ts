import mongoose from 'mongoose';
import { env } from '../config/env.js';
import UserReportModel from '../models/userReportModel.js';
import { checkGdacsMatch } from './gdacsService.js';
import { mockNewsDisasters } from './externalDisasterService.js';

export interface CredibilityResult {
  score: number;
  label: 'High' | 'Medium' | 'Low';
  newsHeadline: string;
  newsUrl: string;
  gdacsMatch: string;
  gdacsUrl: string;
  gdacsAlertLevel: string;
  similarReports: number;
}

interface CredibilityInput {
  crisisType: string;
  extractedLocations: string[];
  aiConfidence: number;
  currentReportId?: string;
}

const CRISIS_ALIASES: Record<string, string[]> = {
  flood: ['flood', 'flash flood', 'flooding'],
  earthquake: ['earthquake', 'seismic', 'tremor', 'quake'],
  storm: ['storm', 'cyclone', 'tropical cyclone', 'typhoon', 'hurricane'],
  wildfire: ['wildfire', 'forest fire', 'forest fires', 'fire', 'bushfire'],
  tsunami: ['tsunami'],
  landslide: ['landslide', 'mudslide'],
  drought: ['drought'],
  epidemic: ['epidemic', 'outbreak'],
  volcano: ['volcano', 'eruption', 'volcanic'],
};

function crisisMatchesText(crisisType: string, text: string): boolean {
  const normalizedCrisis = crisisType.trim().toLowerCase();
  const aliases = CRISIS_ALIASES[normalizedCrisis] ?? [normalizedCrisis];
  const targetText = text.toLowerCase();
  return aliases.some((alias) => targetText.includes(alias));
}

async function checkNewsApi(
  crisisType: string,
  locations: string[],
): Promise<{
  headline: string;
  url: string;
  found: boolean;
}> {
  if (env.externalIntelMock) {
    const mockArticles = mockNewsDisasters();
    const match = mockArticles.find((article) => {
      const fullText = `${article.disasterType} ${article.title} ${article.description}`;
      return crisisMatchesText(crisisType, fullText);
    });

    if (match) {
      return {
        headline: match.title,
        url: match.url,
        found: true,
      };
    }

    return { headline: '', url: '', found: false };
  }

  if (!env.newsApiKey) {
    return { headline: '', url: '', found: false };
  }

  const location = locations[0] ?? '';
  const query = encodeURIComponent(`${crisisType} ${location} ${env.externalIntelCountryName}`.trim());
  const url = [
    'https://newsapi.org/v2/everything',
    `?q=${query}`,
    '&language=en',
    '&sortBy=publishedAt',
    '&pageSize=5',
    `&apiKey=${env.newsApiKey}`,
  ].join('');

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[CredibilityService] NewsAPI HTTP error: ${res.status}`);
      return { headline: '', url: '', found: false };
    }

    const data = (await res.json()) as {
      status: string;
      totalResults?: number;
      articles?: Array<{
        title?: string;
        description?: string;
        url?: string;
      }>;
    };

    if (data.status === 'ok' && data.articles && data.articles.length > 0) {
      const matchingArticle = data.articles.find((article) => {
        const text = `${article.title ?? ''} ${article.description ?? ''}`;
        return crisisMatchesText(crisisType, text);
      });

      if (matchingArticle) {
        return {
          headline: matchingArticle.title ?? '',
          url: matchingArticle.url ?? '',
          found: true,
        };
      }
    }
  } catch (err) {
    console.warn('[CredibilityService] NewsAPI error:', err);
  }

  return { headline: '', url: '', found: false };
}

function normalizePlace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function uniqueValues(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value.split(','))
        .map(normalizePlace)
        .filter(Boolean),
    ),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function checkSimilarReports(
  crisisType: string,
  extractedLocations: string[],
  currentReportId?: string,
): Promise<number> {
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const normalizedLocations = uniqueValues(extractedLocations);
    const locationRegexes = normalizedLocations.map(
      (location) => new RegExp(`\\b${escapeRegex(location)}\\b`, 'i'),
    );

    const query: Record<string, unknown> = {
      createdAt: { $gte: since },
      crisisType: new RegExp(`^${escapeRegex(crisisType)}$`, 'i'),
    };

    if (currentReportId && mongoose.Types.ObjectId.isValid(currentReportId)) {
      query._id = { $ne: new mongoose.Types.ObjectId(currentReportId) };
    }

    if (locationRegexes.length > 0) {
      query.$or = [
        { extractedLocations: { $in: locationRegexes } },
        { location: { $in: locationRegexes } },
      ];
    }

    return UserReportModel.countDocuments(query);
  } catch (err) {
    console.warn('[CredibilityService] DB check error:', err);
    return 0;
  }
}

export async function calculateCredibility(
  input: CredibilityInput,
): Promise<CredibilityResult> {
  const {
    crisisType,
    extractedLocations,
    aiConfidence,
    currentReportId,
  } = input;

  const [newsResult, gdacsResult, similarCount] = await Promise.all([
    checkNewsApi(crisisType, extractedLocations),
    checkGdacsMatch(crisisType, extractedLocations),
    checkSimilarReports(crisisType, extractedLocations, currentReportId),
  ]);

  let score = 0;

  if (newsResult.found) score += 30;
  if (gdacsResult.found) score += 25;

  if (similarCount >= 2) {
    score += 20;
  } else if (similarCount === 1) {
    score += 10;
  }

  if (aiConfidence >= 80) {
    score += 15;
  } else if (aiConfidence >= 60) {
    score += 8;
  } else if (aiConfidence >= 40) {
    score += 4;
  }

  if (extractedLocations.length > 0) score += 10;

  score = Math.min(Math.max(score, 0), 100);

  const label: CredibilityResult['label'] =
    score >= 75 ? 'High' : score >= 50 ? 'Medium' : 'Low';

  console.log(
    `[CredibilityService] score=${score} label=${label}` +
      ` news=${newsResult.found}` +
      ` gdacs=${gdacsResult.found}` +
      ` similar=${similarCount}` +
      ` aiConf=${aiConfidence}`,
  );

  return {
    score,
    label,
    newsHeadline: newsResult.headline,
    newsUrl: newsResult.url,
    gdacsMatch: gdacsResult.title,
    gdacsUrl: gdacsResult.url,
    gdacsAlertLevel: gdacsResult.alertLevel,
    similarReports: similarCount,
  };
}

export default calculateCredibility;
