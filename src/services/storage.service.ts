import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { env, useS3 } from '../config/env';

const s3Client = useS3()
  ? new S3Client({
      region: env.awsRegion,
      credentials: {
        accessKeyId: env.awsAccessKeyId,
        secretAccessKey: env.awsSecretAccessKey,
      },
    })
  : null;

const ensureLocalDir = (dir: string): void => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const getUploadKey = (userId: string, originalName: string): string => {
  const ext = path.extname(originalName);
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `users/${userId}/${uuidv4()}-${safeName}${ext && !safeName.endsWith(ext) ? ext : ''}`;
};

export const uploadFile = async (
  userId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ key: string; url: string; storageType: 's3' | 'local' }> => {
  const key = getUploadKey(userId, originalName);

  if (useS3() && s3Client) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.awsS3Bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    return { key, url: `s3://${env.awsS3Bucket}/${key}`, storageType: 's3' };
  }

  const localDir = path.resolve(env.localUploadDir, `users/${userId}`);
  ensureLocalDir(localDir);
  const fileName = path.basename(key);
  const filePath = path.join(localDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return { key, url: `/uploads/users/${userId}/${fileName}`, storageType: 'local' };
};

export const deleteStoredFile = async (
  key: string,
  storageType: 's3' | 'local',
  userId: string
): Promise<void> => {
  if (storageType === 's3' && s3Client) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.awsS3Bucket, Key: key }));
    return;
  }

  const fileName = path.basename(key);
  const filePath = path.resolve(env.localUploadDir, `users/${userId}`, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export const getPresignedUploadUrl = async (
  userId: string,
  originalName: string,
  mimeType: string
): Promise<{ uploadUrl: string; key: string } | null> => {
  if (!useS3() || !s3Client) return null;

  const key = getUploadKey(userId, originalName);
  const command = new PutObjectCommand({
    Bucket: env.awsS3Bucket,
    Key: key,
    ContentType: mimeType,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return { uploadUrl, key };
};

export const getPresignedDownloadUrl = async (
  key: string,
  storageType: 's3' | 'local',
  userId: string,
  originalName: string
): Promise<string> => {
  if (storageType === 's3' && s3Client) {
    const command = new GetObjectCommand({
      Bucket: env.awsS3Bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${originalName}"`,
    });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }

  return `/files/local/${userId}/${path.basename(key)}`;
};

export const getPresignedViewUrl = async (
  key: string,
  storageType: 's3' | 'local',
  userId: string
): Promise<string> => {
  if (storageType === 's3' && s3Client) {
    const command = new GetObjectCommand({
      Bucket: env.awsS3Bucket,
      Key: key,
      ResponseContentDisposition: 'inline',
    });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }

  return `/files/local/${userId}/${path.basename(key)}`;
};

export const getLocalFilePath = (userId: string, fileName: string): string =>
  path.resolve(env.localUploadDir, `users/${userId}`, fileName);

// Returns a readable stream of the stored file, for either storage backend.
// Used to proxy raw bytes to the client (same-origin) so the browser can parse
// spreadsheets/text without depending on S3 CORS configuration.
export const getFileStream = async (
  key: string,
  storageType: 's3' | 'local',
  userId: string
): Promise<Readable> => {
  if (storageType === 's3' && s3Client) {
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: env.awsS3Bucket, Key: key })
    );
    return result.Body as Readable;
  }

  const filePath = path.resolve(env.localUploadDir, `users/${userId}`, path.basename(key));
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found in local storage');
  }
  return fs.createReadStream(filePath);
};

export const isS3Enabled = (): boolean => useS3();
