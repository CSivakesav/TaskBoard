import { auth } from '@/auth';
import type { SessionUser, Role } from '@/lib/types';

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  return {
    id: (session.user as { id: string }).id,
    name: session.user.name || '',
    email: session.user.email || '',
    role: ((session.user as { role: string }).role || 'MEMBER') as Role,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }
  return user;
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === 'ADMIN';
}
