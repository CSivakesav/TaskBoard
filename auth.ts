import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email);
        const password = String(credentials.password);

        // Dynamic import to avoid Edge runtime issues
        const { authenticateUser } = await import('@/lib/excel/users');
        const user = await authenticateUser(email, password);
        if (!user) return null;

        return {
          id: user.UserID,
          name: user.Name,
          email: user.Email,
          role: user.Role,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      
      // Allow access to login, register, setup, api/auth, api/setup, api/register
      const publicPaths = ['/login', '/register', '/setup', '/api/auth', '/api/setup', '/api/register'];
      const isPublic = publicPaths.some((p) => pathname.startsWith(p));
      
      if (isPublic) return true;
      if (!isLoggedIn) return false; // Redirect to login
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as unknown as { id: string }).id = token.id as string;
        (session.user as unknown as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
});

export const { GET, POST } = handlers;
