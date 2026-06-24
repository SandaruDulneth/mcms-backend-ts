import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import {
  parseFullPredictionResponse,
  type FullPredictionResponse,
} from '../validations/aiResponseValidation.js';

function buildAiUrl(path: string): string {
  return `${env.aiServiceUrl.replace(/\/$/, '')}${path}`;
}

export async function analyzeReportText(text: string): Promise<FullPredictionResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(buildAiUrl('/predict/full'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AppError('AI service request failed', 502, 'AI_SERVICE_ERROR', {
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    const data: unknown = await response.json();

    return parseFullPredictionResponse(data);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('AI service request timed out', 504, 'AI_SERVICE_TIMEOUT');
    }

    throw new AppError('AI service is unavailable', 502, 'AI_SERVICE_UNAVAILABLE', {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}
