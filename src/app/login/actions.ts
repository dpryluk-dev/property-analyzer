'use server';

import { redirect } from 'next/navigation';
import { verifyCredentials, generateSessionToken, createSession } from '@/lib/auth';

export async function login(username: string, password: string) {
  if (!verifyCredentials(username, password)) {
    return { error: 'Invalid username or password' };
  }

  const token = generateSessionToken();
  await createSession(token);
  redirect('/');
}

export async function logout() {
  const { destroySession } = await import('@/lib/auth');
  await destroySession();
  redirect('/login');
}
