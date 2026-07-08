import mongoose, { Document, Schema, Types } from 'mongoose';

export type CardGradient = 'ocean' | 'emerald' | 'sunset' | 'royal' | 'slate' | 'rose';

export interface ICard extends Document {
  userId: Types.ObjectId;
  name: string;
  gradient: CardGradient;
  frontKey: string;
  backKey?: string;
  frontSize: number;
  backSize: number;
  storageType: 's3' | 'local';
  createdAt: Date;
  updatedAt: Date;
}

const cardSchema = new Schema<ICard>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    gradient: {
      type: String,
      enum: ['ocean', 'emerald', 'sunset', 'royal', 'slate', 'rose'],
      default: 'ocean',
    },
    frontKey: { type: String, required: true },
    backKey: { type: String },
    frontSize: { type: Number, default: 0 },
    backSize: { type: Number, default: 0 },
    storageType: { type: String, enum: ['s3', 'local'], default: 'local' },
  },
  { timestamps: true }
);

cardSchema.index({ userId: 1, createdAt: -1 });

export const Card = mongoose.model<ICard>('Card', cardSchema);
