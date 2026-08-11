import UserReportModel, {
  type IUserReport,
  type SourceType,
  type UrgencyLevel,
} from '../models/userReportModel.js';
import { AppError } from '../errors/app-error.js';
import { analyzeReportText } from './aiService.js';
import { geocodeLocations, type GeoLocation } from './geocodingService.js';
import { calculateCredibility } from './credibilityService.js';

export interface CreateUserReportInput {
  message    : string;
  location?  : string | undefined;
  sourceType?: SourceType | undefined;
}

interface UserReportCreatePayload {
  message              : string;
  location?            : string;
  crisisType?          : string;
  crisisConfidence?    : number;
  messageType?         : string;
  messageTypeConfidence?: number;
  urgencyLevel?        : UrgencyLevel;
  urgencyConfidence?   : number;
  extractedLocations?  : string[];
  extractedLocationsGeo?: GeoLocation[];
  affectedCommunities  : string[];
  summary?             : string;
  latencyMs?           : number;
  aiResponse?          : Record<string, unknown>;
  sourceType           : SourceType;
  credibilityScore?    : number;
  credibilityLabel?    : 'High' | 'Medium' | 'Low';
  credibilitySources?  : {
    newsHeadline   : string;
    newsUrl        : string;
    reliefWebMatch : string;
    similarReports : number;
  };
}

const sourceTypes: SourceType[]   = ['User Report', 'News API'];
const urgencyLevels: UrgencyLevel[] = ['Low', 'Medium', 'High', 'Critical'];

function isSourceType(value: unknown): value is SourceType {
  return typeof value === 'string' && sourceTypes.includes(value as SourceType);
}

function isUrgencyLevel(value: unknown): value is UrgencyLevel {
  return typeof value === 'string' && urgencyLevels.includes(value as UrgencyLevel);
}

export async function createUserReport(input: CreateUserReportInput): Promise<IUserReport> {
  const message         = input.message.trim();
  const trimmedLocation = input.location?.trim();

  // ── Step 1: AI analysis ─────────────────────────────────────────────────
  const aiPrediction = await analyzeReportText(message);
  const urgencyLevel = aiPrediction.urgency.urgency_level;

  if (!isUrgencyLevel(urgencyLevel)) {
    throw new AppError('AI service returned an invalid urgency level', 502, 'INVALID_AI_URGENCY');
  }

  const extractedLocations =
    aiPrediction.location_extraction?.locations.map((loc) => loc.text) ?? [];

  const affectedCommunities =
    aiPrediction.community_extraction?.affected_communities.map(
      (community) => community.community,
    ) ?? [];

  const resolvedLocation = trimmedLocation || extractedLocations.join(', ');

  // ── Step 2: Geocoding ───────────────────────────────────────────────────
  const locationsForGeocode: Array<{ text: string; source: string }> =
    aiPrediction.location_extraction?.locations.map((loc) => ({
      text  : loc.text,
      source: loc.source,
    })) ?? [];

  if (trimmedLocation) {
    const alreadyExtracted = locationsForGeocode.some(
      (loc) => loc.text.toLowerCase() === trimmedLocation.toLowerCase(),
    );
    if (!alreadyExtracted) {
      locationsForGeocode.push({ text: trimmedLocation, source: 'user_input' });
    }
  }

  const extractedLocationsGeo = locationsForGeocode.length > 0
    ? await geocodeLocations(locationsForGeocode)
    : [];

  // ── Step 3: Credibility scoring ─────────────────────────────────────────
  // Runs NewsAPI + ReliefWeb + database check in parallel automatically
  const credibility = await calculateCredibility({
    crisisType        : aiPrediction.crisis_type.crisis_type,
    extractedLocations,
    aiConfidence      : aiPrediction.crisis_type.confidence,
  });

  // ── Step 4: Build and save report ───────────────────────────────────────
  const reportPayload: UserReportCreatePayload = {
    message,
    crisisType            : aiPrediction.crisis_type.crisis_type,
    crisisConfidence      : aiPrediction.crisis_type.confidence,
    messageType           : aiPrediction.message_type.message_type,
    messageTypeConfidence : aiPrediction.message_type.confidence,
    urgencyLevel,
    urgencyConfidence     : aiPrediction.urgency.confidence,
    extractedLocations,
    extractedLocationsGeo,
    affectedCommunities,
    summary               : aiPrediction.summary,
    latencyMs             : aiPrediction.latency_ms,
    aiResponse            : aiPrediction,
    sourceType            : input.sourceType ?? 'User Report',

    // Credibility fields
    credibilityScore  : credibility.score,
    credibilityLabel  : credibility.label,
    credibilitySources: {
      newsHeadline  : credibility.newsHeadline,
      newsUrl       : credibility.newsUrl,
      reliefWebMatch: credibility.reliefWebMatch,
      similarReports: credibility.similarReports,
    },
  };

  if (resolvedLocation) {
    reportPayload.location = resolvedLocation;
  }

  return UserReportModel.create(reportPayload);
}

export async function getUserReports(): Promise<IUserReport[]> {
  return UserReportModel.find().select('-aiResponse').sort({ createdAt: -1 });
}