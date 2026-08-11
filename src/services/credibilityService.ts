/**
 * Credibility Service
 *
 * Automatically scores each disaster report on a 0–100 scale using
 * three external signals plus internal AI confidence:
 *
 * 1. NewsAPI        — is real news covering this crisis type + location?
 * 2. ReliefWeb API  — is there an officially declared disaster in Sri Lanka?
 * 3. Own database   — how many similar reports in the last 48 hours?
 * 4. AI confidence  — how certain were the classification models?
 * 5. Location found — did the message mention a specific place?
 *
 * Score interpretation:
 * 75–100 → High Credibility
 * 50–74  → Medium Credibility
 * 0–49   → Low Credibility
 */

import UserReportModel from '../models/userReportModel.js';
import { env } from '../config/env.js';

export interface CredibilityResult {
  score: number;
  label: 'High' | 'Medium' | 'Low';
  newsHeadline: string;
  newsUrl: string;
  reliefWebMatch: string;
  similarReports: number;
}

interface CredibilityInput {
  crisisType: string;
  extractedLocations: string[];
  aiConfidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NewsAPI
// ─────────────────────────────────────────────────────────────────────────────

async function checkNewsApi(
  crisisType: string,
  locations: string[],
): Promise<{
  headline: string;
  url: string;
  found: boolean;
}> {
  if (!env.newsApiKey) {
    return {
      headline: '',
      url: '',
      found: false,
    };
  }

  const location = locations[0] ?? '';

  const query = encodeURIComponent(
    `${crisisType} ${location} Sri Lanka`.trim(),
  );

  const url =
    `https://newsapi.org/v2/everything` +
    `?q=${query}` +
    `&language=en` +
    `&sortBy=publishedAt` +
    `&pageSize=3` +
    `&apiKey=${env.newsApiKey}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(
        `[CredibilityService] NewsAPI HTTP error: ${res.status}`,
      );

      return {
        headline: '',
        url: '',
        found: false,
      };
    }

    const data = (await res.json()) as {
      status: string;
      totalResults?: number;
      articles?: Array<{
        title?: string;
        url?: string;
      }>;
    };

    const firstArticle = data.articles?.[0];

    if (
      data.status === 'ok' &&
      (data.totalResults ?? 0) > 0 &&
      firstArticle
    ) {
      return {
        headline: firstArticle.title ?? '',
        url: firstArticle.url ?? '',
        found: true,
      };
    }
  } catch (err) {
    console.warn(
      '[CredibilityService] NewsAPI error:',
      err,
    );
  }

  return {
    headline: '',
    url: '',
    found: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ReliefWeb API
// ─────────────────────────────────────────────────────────────────────────────
// Free UN OCHA humanitarian API
// No API key required.

async function checkReliefWeb(
  crisisType: string,
): Promise<{
  match: string;
  found: boolean;
}> {
  const typeMap: Record<string, string[]> = {
    flood: ['flood', 'flash flood'],
    earthquake: ['earthquake', 'seismic'],
    storm: ['tropical cyclone', 'storm', 'typhoon'],
    tsunami: ['tsunami'],
    landslide: ['landslide', 'mudslide'],
    wildfire: ['fire', 'wildfire', 'forest fire'],
    drought: ['drought'],
    epidemic: [
      'epidemic',
      'disease outbreak',
      'covid',
    ],
    cold: ['cold wave', 'freeze'],
  };

  const keywords =
    typeMap[crisisType.toLowerCase()] ?? [];

  const url = [
    'https://api.reliefweb.int/v1/disasters',
    '?filter[field]=country.iso3',
    '&filter[value]=LKA',
    '&limit=10',
    '&fields[include][]=name',
    '&fields[include][]=type',
    '&fields[include][]=status',
    '&appname=mcms-fyp',
  ].join('');

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(
        `[CredibilityService] ReliefWeb HTTP error: ${res.status}`,
      );

      return {
        match: '',
        found: false,
      };
    }

    const data = (await res.json()) as {
      data?: Array<{
        fields?: {
          name?: string;
          type?: Array<{
            name?: string;
          }>;
          status?: string;
        };
      }>;
    };

    if (data.data && data.data.length > 0) {
      for (const disaster of data.data) {
        const disasterName =
          disaster.fields?.name ?? '';

        const name =
          disasterName.toLowerCase();

        const types =
          disaster.fields?.type
            ?.map(type => type.name?.toLowerCase() ?? '')
            .filter(Boolean) ?? [];

        const matched = keywords.some(
          keyword =>
            name.includes(keyword) ||
            types.some(type =>
              type.includes(keyword),
            ),
        );

        if (matched) {
          return {
            match: disasterName,
            found: true,
          };
        }
      }
    }
  } catch (err) {
    console.warn(
      '[CredibilityService] ReliefWeb error:',
      err,
    );
  }

  return {
    match: '',
    found: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Similar reports in own database
// ─────────────────────────────────────────────────────────────────────────────

async function checkSimilarReports(
  crisisType: string,
  extractedLocations: string[],
): Promise<number> {
  try {
    const since = new Date(
      Date.now() - 48 * 60 * 60 * 1000,
    );

    const count =
      await UserReportModel.countDocuments({
        createdAt: {
          $gte: since,
        },

        crisisType,

        ...(extractedLocations.length > 0
          ? {
              extractedLocations: {
                $in: extractedLocations,
              },
            }
          : {}),
      });

    return count;
  } catch (err) {
    console.warn(
      '[CredibilityService] DB check error:',
      err,
    );

    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main credibility scoring function
// ─────────────────────────────────────────────────────────────────────────────

export async function calculateCredibility(
  input: CredibilityInput,
): Promise<CredibilityResult> {
  const {
    crisisType,
    extractedLocations,
    aiConfidence,
  } = input;

  // Run external and database checks in parallel
  const [
    newsResult,
    reliefWebResult,
    similarCount,
  ] = await Promise.all([
    checkNewsApi(
      crisisType,
      extractedLocations,
    ),

    checkReliefWeb(
      crisisType,
    ),

    checkSimilarReports(
      crisisType,
      extractedLocations,
    ),
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Score calculation
  // ─────────────────────────────────────────────────────────────────────────

  let score = 0;

  // Signal 1 — NewsAPI match
  // Maximum: 30 points
  if (newsResult.found) {
    score += 30;
  }

  // Signal 2 — ReliefWeb declared disaster
  // Maximum: 25 points
  if (reliefWebResult.found) {
    score += 25;
  }

  // Signal 3 — Similar reports in own database
  // Maximum: 20 points
  if (similarCount >= 3) {
    score += 20;
  } else if (similarCount >= 2) {
    score += 12;
  } else if (similarCount >= 1) {
    score += 6;
  }

  // Signal 4 — AI model confidence
  // Maximum: 15 points
  if (aiConfidence >= 80) {
    score += 15;
  } else if (aiConfidence >= 60) {
    score += 8;
  } else if (aiConfidence >= 40) {
    score += 4;
  }

  // Signal 5 — Location extracted from report
  // Maximum: 10 points
  if (extractedLocations.length > 0) {
    score += 10;
  }

  score = Math.min(
    Math.max(score, 0),
    100,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Credibility label
  // ─────────────────────────────────────────────────────────────────────────

  const label: CredibilityResult['label'] =
    score >= 75
      ? 'High'
      : score >= 50
        ? 'Medium'
        : 'Low';

  console.log(
    `[CredibilityService] score=${score} label=${label}` +
      ` news=${newsResult.found}` +
      ` reliefWeb=${reliefWebResult.found}` +
      ` similar=${similarCount}` +
      ` aiConf=${aiConfidence}`,
  );

  return {
    score,
    label,
    newsHeadline: newsResult.headline,
    newsUrl: newsResult.url,
    reliefWebMatch: reliefWebResult.match,
    similarReports: similarCount,
  };
}

export default calculateCredibility;