import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, IUser } from '../models/User';

export interface AuthRequest extends Request {
  user?: IUser;
  userId?: string;
}

interface TokenPayload {
  userId: string;
  email: string;
}

export const generateAccessToken = (userId: string, email: string): string =>
  jwt.sign({ userId, email } as TokenPayload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);

export const generateRefreshToken = (userId: string, email: string): string =>
  jwt.sign({ userId, email } as TokenPayload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  } as jwt.SignOptions);

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;

    const user = await User.findById(decoded.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
