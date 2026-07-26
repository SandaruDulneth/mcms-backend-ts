import UserReportModel, {
  type IUserReport,
  type SourceType,
  type UrgencyLevel,
} from '../models/userReportModel.js';
import { AppError } from '../errors/app-error.js';
import { analyzeReportText } from './aiService.js';
import { geocodeLocations, type GeoLocation } from './geocodingService.js';

export interface CreateUserReportInput {
  message: string;
  location?: string | undefined;
  sourceType?: SourceType | undefined;
}

interface UserReportCreatePayload {
  message: string;
  location?: string;
  crisisType?: string;
  crisisConfidence?: number;
  messageType?: string;
  messageTypeConfidence?: number;
  urgencyLevel?: UrgencyLevel;
  urgencyConfidence?: number;
  extractedLocations?: string[];
  extractedLocationsGeo?: GeoLocation[];
  affectedCommunities: string[];
  summary?: string;
  latencyMs?: number;
  aiResponse?: Record<string, unknown>;
  sourceType: SourceType;
}

const sourceTypes: SourceType[] = ['User Report', 'News API'];
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
  const aiPrediction    = await analyzeReportText(message);
  const urgencyLevel    = aiPrediction.urgency.urgency_level;

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

  // ── Build the list of locations to geocode ──────────────────────────────
  // Start with AI-extracted locations
  const locationsForGeocode: Array<{ text: string; source: string }> =
    aiPrediction.location_extraction?.locations.map((loc) => ({
      text  : loc.text,
      source: loc.source,
    })) ?? [];

  // Add user-provided location if:
  //   1. The user actually typed one
  //   2. It's not already in the AI-extracted list (case-insensitive dedup)
  if (trimmedLocation) {
    const alreadyExtracted = locationsForGeocode.some(
      (loc) => loc.text.toLowerCase() === trimmedLocation.toLowerCase(),
    );
    if (!alreadyExtracted) {
      locationsForGeocode.push({
        text  : trimmedLocation,
        source: 'user_input',   // clearly tagged so frontend can distinguish
      });
    }
  }

  // Geocode all locations (AI extracted + user provided) in one pass
  const extractedLocationsGeo = locationsForGeocode.length > 0
    ? await geocodeLocations(locationsForGeocode)
    : [];

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
  };

  if (resolvedLocation) {
    reportPayload.location = resolvedLocation;
  }

  return UserReportModel.create(reportPayload);
}

export async function getUserReports(): Promise<IUserReport[]> {
  return UserReportModel.find().select('-aiResponse').sort({ createdAt: -1 });
}