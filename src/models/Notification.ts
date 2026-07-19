import mongoose, { Document, Schema, Types } from 'mongoose';

export type NotificationType =
  | 'family_request'
  | 'family_approved'
  | 'family_rejected'
  | 'family_revoked';

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['family_request', 'family_approved', 'family_rejected', 'family_revoked'],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
