import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { connectDatabase } from './config/database';
import { env, validateEnv } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { sanitizeMongo } from './middleware/sanitize';

validateEnv();

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (kept process alive):', reason);
});

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeMongo);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many auth attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

// Unknown API route → JSON 404 (never an HTML error page or stack trace).
app.use((_req, res) => {
  res.status(404).json({ message: 'Resource not found' });
});

app.use(errorHandler);

const start = async () => {
  await connectDatabase();
  app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
    console.log(`Environment: ${env.nodeEnv}`);
  });
};

start();

export default app;
