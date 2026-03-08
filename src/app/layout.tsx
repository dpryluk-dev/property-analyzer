import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pryluk-Lewin Real Estate Hub',
  description: 'Investment property analysis, refinance calculator, and portfolio management',
  manifest: '/manifest.json',
  themeColor: '#4F8CFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
