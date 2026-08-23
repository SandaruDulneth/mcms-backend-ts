import mongoose, { Document, Model, Schema } from 'mongoose';

export type UrgencyLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type ReportStatus = 'Pending' | 'Active' | 'In Progress' | 'Resolved';
export type SourceType = 'User Report' | 'News API';
export type CredibilityLabel = 'High' | 'Medium' | 'Low';

// Coordinates for one extracted location — stored alongside the report
// so the frontend can render map pins without calling Nominatim again.
export interface IGeoLocation {
  name: string;
  lat: number;
  lng: number;
  displayName: string;
  source: string; // "spacy_ner" or "gazetteer"
}

// Sources used when calculating the credibility score
export interface ICredibilitySources {
  newsHeadline: string;   // Matching NewsAPI article title
  newsUrl: string;        // URL of the matching news article
  gdacsMatch: string; // Matching GDACS disaster alert
  gdacsUrl: string; // Link to matching GDACS alert
  gdacsAlertLevel: string; // GDACS alert level
  similarReports: number; // Similar reports detected in the last 48 hours
}

export interface IUserReport extends Document {
  message: string;
  location?: string;

  // Translation fields
  detectedLanguage?: string;
  wasTranslated?: boolean;
  translatedText?: string;

  crisisType?: string;
  crisisConfidence?: number;

  messageType?: string;
  messageTypeConfidence?: number;

  urgencyLevel?: UrgencyLevel;
  urgencyConfidence?: number;

  extractedLocations?: string[];
  extractedLocationsGeo?: IGeoLocation[];

  affectedCommunities: string[];

  summary?: string;
  latencyMs?: number;

  aiResponse?: Record<string, unknown>;

  status: ReportStatus;
  sourceType: SourceType;

  // Credibility information
  credibilityScore?: number;
  credibilityLabel?: CredibilityLabel;
  credibilitySources?: ICredibilitySources;

  createdAt: Date;
  updatedAt: Date;
}

// Sub-schema for one geocoded location
const geoLocationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },

    lat: {
      type: Number,
      required: true,
    },

    lng: {
      type: Number,
      required: true,
    },

    displayName: {
      type: String,
    },

    source: {
      type: String,
    },
  },
  {
    _id: false, // no separate _id for embedded documents
  },
);

// Sub-schema containing evidence used for credibility calculation
const credibilitySourcesSchema = new Schema(
  {
    newsHeadline: {
      type: String,
      default: '',
    },

    newsUrl: {
      type: String,
      default: '',
    },

    gdacsMatch: {
      type: String,
      default: '',
    },

    gdacsUrl: {
      type: String,
      default: '',
    },

    gdacsAlertLevel: {
      type: String,
      default: '',
    },
    similarReports: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  },
);

const userReportSchema = new Schema(
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

    detectedLanguage: {
      type: String,
      trim: true,
    },

    wasTranslated: {
      type: Boolean,
      default: false,
    },

    translatedText: {
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
      max: 100,
    },

    messageType: {
      type: String,
      index: true,
    },

    messageTypeConfidence: {
      type: Number,
      min: 0,
      max: 100,
    },

    urgencyLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      index: true,
    },

    urgencyConfidence: {
      type: Number,
      min: 0,
      max: 100,
    },

    extractedLocations: {
      type: [String],
      default: [],
    },

    // Geocoded coordinates — ready for frontend map rendering
    extractedLocationsGeo: {
      type: [geoLocationSchema],
      default: [],
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

    // ─────────────────────────────────────────────
    // Credibility scoring
    // ─────────────────────────────────────────────

    // Overall credibility score between 0 and 100
    credibilityScore: {
      type: Number,
      min: 0,
      max: 100,
    },

    // Human-readable credibility classification
    credibilityLabel: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
    },

    // Evidence used when calculating credibility
    credibilitySources: {
      type: credibilitySourcesSchema,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Sort reports by newest first
userReportSchema.index({ createdAt: -1 });

// Useful for filtering reports by crisis type and urgency
userReportSchema.index({
  crisisType: 1,
  urgencyLevel: 1,
});

// Useful for admin credibility filtering
userReportSchema.index({
  credibilityLabel: 1,
});

export const UserReportModel =
  (mongoose.models.UserReport as Model<IUserReport> | undefined) ||
  mongoose.model<IUserReport>('UserReport', userReportSchema);

export default UserReportModel;
