export { auth as proxy } from '@/auth';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login
     * - /register
     * - /setup
     * - /api/auth (NextAuth routes)
     * - /api/setup (initial setup)
     * - /api/register (user registration)
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico
     */
    '/((?!login|register|setup|api/auth|api/setup|api/register|_next/static|_next/image|favicon.ico).*)',
  ],
};
