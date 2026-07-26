import mongoose from 'mongoose';
import ResponderModel, { type IResponder } from '../models/responderModel.js';
import { AppError } from '../errors/app-error.js';
import UserReportModel from '../models/userReportModel.js';
import type { CreateResponderInput } from '../validations/responderValidation.js';

export async function addResponder(
  reportId: string,
  input: CreateResponderInput,
): Promise<IResponder> {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw new AppError('Invalid report ID', 400, 'INVALID_REPORT_ID');
  }

  const report = await UserReportModel.findById(reportId).select('status');
  if (!report) {
    throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');
  }
  if (report.status !== 'Active') {
    throw new AppError(
      'Responses can only be added to active reports',
      400,
      'REPORT_NOT_ACTIVE',
    );
  }

  // Build payload explicitly — optional fields only added when they have a value
  // This avoids Mongoose's string | RegExp type conflict with string | undefined
  const payload: {
    reportId    : string;
    name        : string;
    responseType: CreateResponderInput['responseType'];
    message     : string;
    organization?: string;
    contactInfo? : string;
  } = {
    reportId,
    name        : input.name,
    responseType: input.responseType,
    message     : input.message,
  };

  if (input.organization) payload.organization = input.organization;
  if (input.contactInfo)  payload.contactInfo  = input.contactInfo;

  return ResponderModel.create(payload);
}

export async function getRespondersByReport(reportId: string): Promise<IResponder[]> {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw new AppError('Invalid report ID', 400, 'INVALID_REPORT_ID');
  }
  return ResponderModel.find({ reportId }).sort({ createdAt: -1 });
}