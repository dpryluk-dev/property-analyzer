import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Property Analyzer - Cash Purchase ROI Engine',
  description: 'Analyze investment properties with AI-powered rent research',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
