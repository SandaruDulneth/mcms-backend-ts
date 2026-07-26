import mongoose, { Document, Model, Schema } from 'mongoose';

export type ResponseType =
  | 'rescue'
  | 'medical'
  | 'food_water'
  | 'shelter'
  | 'transport'
  | 'donation'
  | 'information'
  | 'other';

export type ResponderStatus =
  | 'offered'
  | 'en_route'
  | 'arrived'
  | 'completed';

export interface IResponder extends Document {
  reportId     : mongoose.Types.ObjectId;
  name         : string;
  organization?: string;
  responseType : ResponseType;
  message      : string;
  contactInfo? : string;
  status       : ResponderStatus;
  createdAt    : Date;
  updatedAt    : Date;
}

const responderSchema = new Schema<IResponder>(
  {
    reportId: {
      type    : Schema.Types.ObjectId,
      ref     : 'UserReport',
      required: true,
      index   : true,
    },
    name: {
      type    : String,
      required: true,
      trim    : true,
    },
    organization: {
      type: String,
      trim: true,
    },
    responseType: {
      type    : String,
      enum    : ['rescue', 'medical', 'food_water', 'shelter', 'transport', 'donation', 'information', 'other'],
      required: true,
    },
    message: {
      type    : String,
      required: true,
      trim    : true,
    },
    contactInfo: {
      type: String,
      trim: true,
    },
    status: {
      type   : String,
      enum   : ['offered', 'en_route', 'arrived', 'completed'],
      default: 'offered',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

responderSchema.index({ reportId: 1, createdAt: -1 });

export const ResponderModel =
  (mongoose.models.Responder as Model<IResponder> | undefined) ||
  mongoose.model<IResponder>('Responder', responderSchema);

export default ResponderModel;
