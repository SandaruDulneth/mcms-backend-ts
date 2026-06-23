import mongoose, { Document, Model, Schema } from 'mongoose';

export type UrgencyLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type ReportStatus = 'Pending' | 'Active' | 'In Progress' | 'Resolved';
export type SourceType = 'User Report' | 'News API';

export interface IUserReport extends Document {
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

  status: ReportStatus;
  sourceType: SourceType;

  createdAt: Date;
  updatedAt: Date;
}

const userReportSchema = new Schema<IUserReport>(
  {
    message: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      trim: true,
    },

    crisisType: {
      type: String,
      index: true,
    },

    crisisConfidence: {
      type: Number,
      min: 0,
      max: 1,
    },

    messageType: {
      type: String,
      index: true,
    },

    messageTypeConfidence: {
      type: Number,
      min: 0,
      max: 1,
    },

    urgencyLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      index: true,
    },

    urgencyConfidence: {
      type: Number,
      min: 0,
      max: 1,
    },

    affectedCommunities: {
      type: [String],
      default: [],
    },

    summary: {
      type: String,
    },

    latencyMs: {
      type: Number,
      min: 0,
    },

    aiResponse: {
      type: Schema.Types.Mixed,
    },

    status: {
      type: String,
      enum: ['Pending', 'Active', 'In Progress', 'Resolved'],
      default: 'Pending',
      index: true,
    },

    sourceType: {
      type: String,
      enum: ['User Report', 'News API'],
      default: 'User Report',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userReportSchema.index({ createdAt: -1 });
userReportSchema.index({ crisisType: 1, urgencyLevel: 1 });

export const UserReportModel =
  (mongoose.models.UserReport as Model<IUserReport> | undefined) ||
  mongoose.model<IUserReport>('UserReport', userReportSchema);

export default UserReportModel;
