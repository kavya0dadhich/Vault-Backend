import mongoose, { Document, Schema, Types } from 'mongoose';

export type FamilyLinkStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';

export interface IFamilyLink extends Document {
  requesterId: Types.ObjectId;
  memberId: Types.ObjectId;
  status: FamilyLinkStatus;
  otpHash?: string;
  otpExpires?: Date;
  otpAttempts: number;
  memberApprovedAt?: Date;
  otpVerifiedAt?: Date;
  revokedAt?: Date;
  revokedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const familyLinkSchema = new Schema<IFamilyLink>(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    memberApprovedAt: { type: Date },
    otpVerifiedAt: { type: Date },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Every list view (my requests, requests to me) filters by one side of the
// pair plus status, so index both directions.
familyLinkSchema.index({ requesterId: 1, status: 1 });
familyLinkSchema.index({ memberId: 1, status: 1 });

export const FamilyLink = mongoose.model<IFamilyLink>('FamilyLink', familyLinkSchema);
