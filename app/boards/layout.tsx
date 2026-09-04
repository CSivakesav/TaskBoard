import { SessionProvider } from 'next-auth/react';

export default function BoardsLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
