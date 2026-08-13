import UserReportModel, {
  type CredibilityLabel,
  type IUserReport,
  type SourceType,
  type UrgencyLevel,
} from '../models/userReportModel.js';
import logger from '../config/logger.js';
import { AppError } from '../errors/app-error.js';
import { analyzeReportText } from './aiService.js';
import { calculateCredibility } from './credibilityService.js';
import { geocodeLocations, type GeoLocation } from './geocodingService.js';

export interface CreateUserReportInput {
  message: string;
  location?: string | undefined;
  sourceType?: SourceType | undefined;
}

interface UserReportAnalysisPayload {
  location?: string;
  crisisType: string;
  crisisConfidence: number;
  messageType: string;
  messageTypeConfidence: number;
  urgencyLevel: UrgencyLevel;
  urgencyConfidence: number;
  extractedLocations: string[];
  extractedLocationsGeo: GeoLocation[];
  affectedCommunities: string[];
  summary: string;
  latencyMs: number;
  aiResponse: Record<string, unknown>;
  credibilityScore: number;
  credibilityLabel: CredibilityLabel;
  credibilitySources: {
    newsHeadline: string;
    newsUrl: string;
    gdacsMatch: string;
    gdacsUrl: string;
    gdacsAlertLevel: string;
    similarReports: number;
  };
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

  // Save the raw human report first. This keeps the report even if the AI,
  // geocoding, or credibility services are unavailable.
  const report = await UserReportModel.create({
    message,
    ...(trimmedLocation ? { location: trimmedLocation } : {}),
    sourceType,
    status: 'Pending',
    affectedCommunities: [],
    extractedLocations: [],
    extractedLocationsGeo: [],
  });

  try {
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

    const locationsForGeocode: Array<{ text: string; source: string }> =
      aiPrediction.location_extraction?.locations.map((location) => ({
        text: location.text,
        source: location.source,
      })) ?? [];

    if (trimmedLocation) {
      const alreadyExtracted = locationsForGeocode.some(
        (location) => location.text.toLowerCase() === trimmedLocation.toLowerCase(),
      );

      if (!alreadyExtracted) {
        locationsForGeocode.push({ text: trimmedLocation, source: 'user_input' });
      }
    }

    let extractedLocationsGeo: GeoLocation[] = [];

    try {
      extractedLocationsGeo = locationsForGeocode.length > 0
        ? await geocodeLocations(locationsForGeocode)
        : [];
    } catch (error) {
      logger.warn('Failed to geocode extracted report locations', {
        reportId: report.id,
        error,
      });
    }

    const credibilityLocations = Array.from(
      new Set([
        ...extractedLocations,
        ...(trimmedLocation ? [trimmedLocation] : []),
      ]),
    );

    const credibility = await calculateCredibility({
      crisisType: aiPrediction.crisis_type.crisis_type,
      extractedLocations: credibilityLocations,
      aiConfidence: aiPrediction.crisis_type.confidence,
      currentReportId: report.id,
    });

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
      credibilityScore: credibility.score,
      credibilityLabel: credibility.label,
      credibilitySources: {
        newsHeadline: credibility.newsHeadline,
        newsUrl: credibility.newsUrl,
        gdacsMatch: credibility.gdacsMatch,
        gdacsUrl: credibility.gdacsUrl,
        gdacsAlertLevel: credibility.gdacsAlertLevel,
        similarReports: credibility.similarReports,
      },
    };

    if (resolvedLocation) {
      reportPayload.location = resolvedLocation;
    }

    // Update the same document with AI + credibility data, but keep status as
    // Pending. Admin approval is the only step that publishes it to users.
    const analyzedReport = await UserReportModel.findByIdAndUpdate(
      report.id,
      { $set: reportPayload },
      { new: true, runValidators: true },
    ).select('-aiResponse');

    if (!analyzedReport) {
      throw new AppError('Saved report could not be found for AI update', 500, 'REPORT_UPDATE_FAILED');
    }

    return analyzedReport;
  } catch (error) {
    logger.error('Report saved, but AI analysis failed', {
      reportId: report.id,
      error,
    });

    return report;
  }
}

export async function getUserReports(): Promise<IUserReport[]> {
  return UserReportModel.find({
    status: { $in: ['Active', 'In Progress'] },
  })
    .select('-aiResponse')
    .sort({ createdAt: -1 });
}

export async function getAllUserReports(): Promise<IUserReport[]> {
  return UserReportModel.find()
    .select('-aiResponse')
    .sort({ createdAt: -1 });
}
