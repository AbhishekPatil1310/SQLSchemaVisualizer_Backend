import { Request, Response, NextFunction } from 'express';
import jwt, { Secret } from 'jsonwebtoken';
import { JwtPayload } from '../types/auth.js';

// Extend Express Request type to include user
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const secret = process.env.JWT_SECRET as Secret;
    const decoded = jwt.verify(token, secret) as JwtPayload;
    
    req.user = decoded; // Attach decoded user info (userId, email)
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
  }
};