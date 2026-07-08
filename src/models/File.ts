import mongoose, { Document, Schema, Types } from 'mongoose';

export type FileCategory =
  | 'personal'
  | 'education'
  | 'finance'
  | 'medical'
  | 'government'
  | 'travel'
  | 'work'
  | 'custom';

export interface IFile extends Document {
  userId: Types.ObjectId;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  s3Url: string;
  storageType: 's3' | 'local';
  folderId?: Types.ObjectId | null;
  parentPath: string;
  tags: string[];
  category: FileCategory;
  customCategory?: string;
  isFavorite: boolean;
  isTrashed: boolean;
  trashedAt?: Date;
  isFolder: boolean;
  copiedFrom?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<IFile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    s3Key: { type: String, default: '' },
    s3Url: { type: String, default: '' },
    storageType: { type: String, enum: ['s3', 'local'], default: 'local' },
    folderId: { type: Schema.Types.ObjectId, ref: 'File', default: null, index: true },
    parentPath: { type: String, default: '/' },
    tags: [{ type: String, trim: true }],
    category: {
      type: String,
      enum: ['personal', 'education', 'finance', 'medical', 'government', 'travel', 'work', 'custom'],
      default: 'personal',
    },
    customCategory: { type: String },
    isFavorite: { type: Boolean, default: false },
    isTrashed: { type: Boolean, default: false, index: true },
    trashedAt: { type: Date },
    isFolder: { type: Boolean, default: false },
    copiedFrom: { type: Schema.Types.ObjectId, ref: 'File' },
  },
  { timestamps: true }
);

fileSchema.index({ userId: 1, name: 'text', tags: 'text', originalName: 'text' });
fileSchema.index({ userId: 1, isTrashed: 1, folderId: 1 });
fileSchema.index({ userId: 1, category: 1 });
fileSchema.index({ userId: 1, mimeType: 1 });

export const File = mongoose.model<IFile>('File', fileSchema);
