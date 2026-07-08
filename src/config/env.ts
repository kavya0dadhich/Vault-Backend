import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/document-vault',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  awsS3Bucket: process.env.AWS_S3_BUCKET || '',
  localUploadDir: process.env.LOCAL_UPLOAD_DIR || './uploads',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'noreply@documentvault.com',
};

export const useS3 = (): boolean =>
  Boolean(env.awsAccessKeyId && env.awsSecretAccessKey && env.awsS3Bucket);

const INSECURE_DEFAULTS = [
  'dev-jwt-secret-change-me',
  'dev-refresh-secret-change-me',
  'dev-jwt-secret-change-in-production-abc123',
  'dev-refresh-secret-change-in-production-xyz789',
  'your-super-secret-jwt-key-change-in-production',
  'your-super-secret-refresh-key-change-in-production',
];

export const validateEnv = (): void => {
  const problems: string[] = [];

  if (!process.env.JWT_SECRET || INSECURE_DEFAULTS.includes(env.jwtSecret)) {
    problems.push('JWT_SECRET is missing or using an insecure default value');
  }
  if (!process.env.JWT_REFRESH_SECRET || INSECURE_DEFAULTS.includes(env.jwtRefreshSecret)) {
    problems.push('JWT_REFRESH_SECRET is missing or using an insecure default value');
  }
  if (env.jwtSecret === env.jwtRefreshSecret) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must not be the same value');
  }

  if (problems.length === 0) return;

  if (env.nodeEnv === 'production') {
    console.error('Refusing to start in production with insecure configuration:');
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  } else {
    console.warn('Insecure configuration detected (allowed outside production):');
    problems.forEach((p) => console.warn(`  - ${p}`));
  }
};
