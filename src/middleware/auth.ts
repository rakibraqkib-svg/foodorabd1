import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export type UserRole = 'customer' | 'restaurant_owner' | 'rider' | 'admin' | 'super_admin';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  isSandbox: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

const SANDBOX_SECRET =
  process.env.SANDBOX_SESSION_SECRET ||
  `foodora-bd-sandbox-${process.env.SQL_DB_NAME || 'dev'}-${process.env.APPLET_ID || 'local'}`;

export function signSandboxToken(payload: {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
}): string {
  const data = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SANDBOX_SECRET).update(data).digest('base64url');
  return `sbx.${data}.${sig}`;
}

export function verifySandboxToken(token: string): AuthenticatedUser | null {
  if (!token.startsWith('sbx.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SANDBOX_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return {
      uid: parsed.uid,
      email: parsed.email,
      fullName: parsed.fullName,
      role: parsed.role,
      isSandbox: true,
    };
  } catch {
    return null;
  }
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  fullName?: string,
  defaultRole: UserRole = 'customer'
) {
  try {
    const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (existing.length > 0) {
      return existing[0];
    }
    const assignedRole: UserRole =
      email.toLowerCase() === 'rakibraqkib@gmail.com' ? 'super_admin' : defaultRole;
    const inserted = await db
      .insert(users)
      .values({
        uid,
        email,
        fullName: fullName || email.split('@')[0] || 'Foodora User',
        role: assignedRole,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

async function resolveUserFromHeader(authHeader?: string): Promise<AuthenticatedUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  // 1. Check server-signed sandbox persona token
  const sandboxUser = verifySandboxToken(token);
  if (sandboxUser) {
    const dbUser = await getOrCreateUser(
      sandboxUser.uid,
      sandboxUser.email,
      sandboxUser.fullName,
      sandboxUser.role
    );
    return {
      uid: dbUser.uid,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: dbUser.role as UserRole,
      isSandbox: true,
    };
  }

  // 2. Verify genuine Firebase Auth ID token
  const decoded = await adminAuth.verifyIdToken(token);
  const email = decoded.email || `${decoded.uid}@foodora.bd`;
  const fullName = (decoded.name as string | undefined) || email.split('@')[0];
  const dbUser = await getOrCreateUser(decoded.uid, email, fullName, 'customer');
  return {
    uid: dbUser.uid,
    email: dbUser.email,
    fullName: dbUser.fullName,
    role: dbUser.role as UserRole,
    isSandbox: false,
  };
}

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const user = await resolveUserFromHeader(req.headers.authorization);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    console.warn('Optional auth token ignored:', err instanceof Error ? err.message : err);
  }
  next();
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await resolveUserFromHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid authentication token' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ error: 'Unauthorized: Token verification failed' });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient role permissions' });
    }
    next();
  };
};
