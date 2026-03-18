import { cookies } from 'next/headers';
import crypto from 'crypto';

const SESSION_COOKIE = 'pl_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  return process.env.SESSION_SECRET || 'pl-re-hub-default-secret-change-me';
}

function hashToken(token: string): string {
  return crypto.createHmac('sha256', getSecret()).update(token).digest('hex');
}

export function verifyCredentials(username: string, password: string): boolean {
  const validUser = process.env.AUTH_USERNAME;
  const validPass = process.env.AUTH_PASSWORD;
  if (!validUser || !validPass) return false;
  return username === validUser && password === validPass;
}

export function generateSessionToken(): string {
  const raw = crypto.randomBytes(32).toString('hex');
  return hashToken(raw + Date.now().toString());
}

export async function createSession(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value || null;
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
