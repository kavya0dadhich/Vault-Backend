import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IActivity extends Document {
  userId: Types.ObjectId;
  action: string;
  targetType: 'file' | 'folder' | 'profile' | 'auth' | 'card' | 'family';
  targetId?: Types.ObjectId;
  targetName?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true },
    targetType: { type: String, enum: ['file', 'folder', 'profile', 'auth', 'card', 'family'], required: true },
    targetId: { type: Schema.Types.ObjectId },
    targetName: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.index({ userId: 1, createdAt: -1 });

export const Activity = mongoose.model<IActivity>('Activity', activitySchema);
