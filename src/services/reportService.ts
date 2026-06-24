import UserReportModel, {
  type IUserReport,
  type SourceType,
  type UrgencyLevel,
} from '../models/userReportModel.js';
import { AppError } from '../errors/app-error.js';
import { analyzeReportText } from './aiService.js';

export type CreateUserReportInput = {
  message: string;
  location?: string | undefined;
  sourceType?: SourceType | undefined;
};

type UserReportCreatePayload = {
  message: string;
  location?: string;
  crisisType?: string;
  crisisConfidence?: number;
  messageType?: string;
  messageTypeConfidence?: number;
  urgencyLevel?: UrgencyLevel;
  urgencyConfidence?: number;
  affectedCommunities: string[];
  summary?: string;
  latencyMs?: number;
  aiResponse?: Record<string, unknown>;
  sourceType: SourceType;
};

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
  const aiPrediction = await analyzeReportText(message);
  const urgencyLevel = aiPrediction.urgency.urgency_level;

  if (!isUrgencyLevel(urgencyLevel)) {
    throw new AppError('AI service returned an invalid urgency level', 502, 'INVALID_AI_URGENCY');
  }

  const reportPayload: UserReportCreatePayload = {
    message,
    crisisType: aiPrediction.crisis_type.crisis_type,
    crisisConfidence: aiPrediction.crisis_type.confidence,
    messageType: aiPrediction.message_type.message_type,
    messageTypeConfidence: aiPrediction.message_type.confidence,
    urgencyLevel,
    urgencyConfidence: aiPrediction.urgency.confidence,
    affectedCommunities: [],
    summary: aiPrediction.summary,
    latencyMs: aiPrediction.latency_ms,
    aiResponse: aiPrediction,
    sourceType: input.sourceType ?? 'User Report',
  };

  if (trimmedLocation) {
    reportPayload.location = trimmedLocation;
  }

  return UserReportModel.create(reportPayload);
}
