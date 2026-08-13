import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import UserReportModel, { type ReportStatus } from '../models/userReportModel.js';
import ResponderModel, { type ResponderStatus } from '../models/responderModel.js';
import { AppError } from '../errors/app-error.js';

// ── Valid enum values ────────────────────────────────────────────────────────
const REPORT_STATUSES: ReportStatus[] = ['Pending', 'Active', 'In Progress', 'Resolved'];
const RESPONDER_STATUSES: ResponderStatus[] = ['offered', 'en_route', 'arrived', 'completed'];

// GET /api/admin/reports
// Admin review endpoint: returns every report, including Pending reports that
// are hidden from public ongoing-disaster pages.
export const getAllReports: RequestHandler = async (_req, res, next) => {
  try {
    const reports = await UserReportModel.find()
      .select('-aiResponse')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: reports });
  } catch (error) {
    next(error);
  }
};
// ── GET /api/admin/stats ─────────────────────────────────────────────────────
export const getAdminStats: RequestHandler = async (_req, res, next) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalReports,
      totalResponders,
      urgencyAgg,
      statusAgg,
      crisisAgg,
      dailyAgg,
    ] = await Promise.all([
      UserReportModel.countDocuments(),
      ResponderModel.countDocuments(),
      UserReportModel.aggregate<{ _id: string; count: number }>([
        { $match: { urgencyLevel: { $ne: null } } },
        { $group: { _id: '$urgencyLevel', count: { $sum: 1 } } },
      ]),
      UserReportModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      UserReportModel.aggregate<{ _id: string; count: number }>([
        { $match: { crisisType: { $ne: null } } },
        { $group: { _id: '$crisisType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      UserReportModel.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Build lookup maps
    const byUrgency: Record<string, number> = { High: 0, Medium: 0, Low: 0, Critical: 0 };
    for (const item of urgencyAgg) {
      if (item._id) byUrgency[item._id] = item.count;
    }

    const byStatus: Record<string, number> = { Pending: 0, Active: 0, 'In Progress': 0, Resolved: 0 };
    for (const item of statusAgg) {
      if (item._id) byStatus[item._id] = item.count;
    }

    const byCrisisType: Record<string, number> = {};
    for (const item of crisisAgg) {
      if (item._id) byCrisisType[item._id] = item.count;
    }

    // Fill missing days in the last-7-days series
    const dailyMap = new Map(dailyAgg.map((d) => [d._id, d.count]));
    const reportsLast7Days: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      reportsLast7Days.push({ date: key, count: dailyMap.get(key) ?? 0 });
    }

    res.json({
      success: true,
      data: {
        totalReports,
        byUrgency,
        byStatus,
        byCrisisType,
        totalResponders,
        reportsLast7Days,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/admin/responders ────────────────────────────────────────────────
export const getAllResponders: RequestHandler = async (_req, res, next) => {
  try {
    const responders = await ResponderModel.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: responders });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/reports/:id/status ────────────────────────────────────────────
export const updateReportStatus: RequestHandler = async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body as { status?: string };

    if (!status || !REPORT_STATUSES.includes(status as ReportStatus)) {
      throw new AppError(
        `Invalid status. Must be one of: ${REPORT_STATUSES.join(', ')}`,
        400,
        'INVALID_STATUS',
      );
    }

    const report = await UserReportModel.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true },
    ).select('-aiResponse');

    if (!report) {
      throw new AppError('Report not found', 404, 'NOT_FOUND');
    }

    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/reports/:id ──────────────────────────────────────────────────
export const deleteReport: RequestHandler = async (req, res, next) => {
  try {
    const id = req.params.id as string;

    const report = await UserReportModel.findByIdAndDelete(id);
    if (!report) {
      throw new AppError('Report not found', 404, 'NOT_FOUND');
    }

    // Cascade-delete associated responders
    await ResponderModel.deleteMany({ reportId: new mongoose.Types.ObjectId(id) });

    res.json({ success: true, data: { deletedId: id } });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/reports/:id/responders/:responderId/status ────────────────────
export const updateResponderStatus: RequestHandler = async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const responderId = req.params.responderId as string;
    const { status } = req.body as { status?: string };

    if (!status || !RESPONDER_STATUSES.includes(status as ResponderStatus)) {
      throw new AppError(
        `Invalid status. Must be one of: ${RESPONDER_STATUSES.join(', ')}`,
        400,
        'INVALID_STATUS',
      );
    }

    const responder = await ResponderModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(responderId), reportId: new mongoose.Types.ObjectId(id) },
      { status },
      { new: true, runValidators: true },
    );

    if (!responder) {
      throw new AppError('Responder not found', 404, 'NOT_FOUND');
    }

    res.json({ success: true, data: responder });
  } catch (error) {
    next(error);
  }
};
