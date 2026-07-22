import UserReportModel, {
  type IUserReport,
  type SourceType,
  type UrgencyLevel,
} from '../models/userReportModel.js';
import logger from '../config/logger.js';
import { AppError } from '../errors/app-error.js';
import { analyzeReportText } from './aiService.js';
import { geocodeLocations, type GeoLocation } from './geocodingService.js';

export interface CreateUserReportInput {
  message: string;
  location?: string | undefined;
  sourceType?: SourceType | undefined;
}

interface UserReportAnalysisPayload {
  location?: string;
  crisisType?: string;
  crisisConfidence?: number;
  messageType?: string;
  messageTypeConfidence?: number;
  urgencyLevel?: UrgencyLevel;
  urgencyConfidence?: number;
  extractedLocations?: string[];
  extractedLocationsGeo?: GeoLocation[];
  affectedCommunities?: string[];
  summary?: string;
  latencyMs?: number;
  aiResponse?: Record<string, unknown>;
  status: 'Active';
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
  const message = input.message.trim();
  const trimmedLocation = input.location?.trim();
  const sourceType = input.sourceType ?? 'User Report';

  if (!isSourceType(sourceType)) {
    throw new AppError('Invalid report source type', 400, 'INVALID_REPORT_SOURCE_TYPE');
  }

  // Step 1: save the user's original report immediately.
  // This protects the report even when the AI backend is slow or unavailable.
  const report = await UserReportModel.create({
    message,
    ...(trimmedLocation ? { location: trimmedLocation } : {}),
    affectedCommunities: [],
    extractedLocations: [],
    extractedLocationsGeo: [],
    sourceType,
    status: 'Pending',
  });

  try {
    // Step 2: run the Python/FastAPI AI pipeline after the raw report is safe in MongoDB.
    const aiPrediction = await analyzeReportText(message);
    const urgencyLevel = aiPrediction.urgency.urgency_level;

    if (!isUrgencyLevel(urgencyLevel)) {
      throw new AppError('AI service returned an invalid urgency level', 502, 'INVALID_AI_URGENCY');
    }

    const extractedLocations =
      aiPrediction.location_extraction?.locations.map((location) => location.text) ?? [];

    const affectedCommunities =
      aiPrediction.community_extraction?.affected_communities.map(
        (community) => community.community,
      ) ?? [];

    const resolvedLocation = trimmedLocation || extractedLocations.join(', ');

    const locationsForGeocode =
      aiPrediction.location_extraction?.locations.map((location) => ({
        text: location.text,
        source: location.source,
      })) ?? [];

    let extractedLocationsGeo: GeoLocation[] = [];

    try {
      // Map coordinates are useful, but they should not block report analysis.
      extractedLocationsGeo = locationsForGeocode.length > 0
        ? await geocodeLocations(locationsForGeocode)
        : [];
    } catch (error) {
      logger.warn('Failed to geocode extracted report locations', {
        reportId: report.id,
        error,
      });
    }

    const reportPayload: UserReportAnalysisPayload = {
      crisisType: aiPrediction.crisis_type.crisis_type,
      crisisConfidence: aiPrediction.crisis_type.confidence,
      messageType: aiPrediction.message_type.message_type,
      messageTypeConfidence: aiPrediction.message_type.confidence,
      urgencyLevel,
      urgencyConfidence: aiPrediction.urgency.confidence,
      extractedLocations,
      extractedLocationsGeo,
      affectedCommunities,
      summary: aiPrediction.summary,
      latencyMs: aiPrediction.latency_ms,
      aiResponse: aiPrediction,
      status: 'Active',
    };

    if (resolvedLocation) {
      reportPayload.location = resolvedLocation;
    }

    // Step 3: update the same DB document with the AI result.
    const analyzedReport = await UserReportModel.findByIdAndUpdate(
      report.id,
      { $set: reportPayload },
      { new: true, runValidators: true },
    );

    if (!analyzedReport) {
      throw new AppError('Saved report could not be found for AI update', 500, 'REPORT_UPDATE_FAILED');
    }

    return analyzedReport;
  } catch (error) {
    // The important part: do not delete/lose the user's report if AI fails.
    // It remains in MongoDB with status "Pending" and can be retried later.
    logger.error('Report saved, but AI analysis failed', {
      reportId: report.id,
      error,
    });

    return report;
  }
}

export async function getUserReports(): Promise<IUserReport[]> {
  return UserReportModel.find().select('-aiResponse').sort({ createdAt: -1 });
}
