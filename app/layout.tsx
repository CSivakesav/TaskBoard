import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaskBoard — Modern Task Management',
  description: 'A Trello-style kanban board with Excel-backed persistence for teams.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
