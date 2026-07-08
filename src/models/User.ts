import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  bio?: string;
  twoFactorEnabled: boolean;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  refreshToken?: string;
  settings: {
    theme: 'light' | 'dark' | 'system';
    accentColor: string;
    language: string;
    notifications: {
      email: boolean;
      upload: boolean;
      share: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    avatar: { type: String },
    phone: { type: String },
    bio: { type: String, maxlength: 500 },
    twoFactorEnabled: { type: Boolean, default: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    refreshToken: { type: String, select: false },
    settings: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      accentColor: { type: String, default: '#6366f1' },
      language: { type: String, default: 'en' },
      notifications: {
        email: { type: Boolean, default: true },
        upload: { type: Boolean, default: true },
        share: { type: Boolean, default: false },
      },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
