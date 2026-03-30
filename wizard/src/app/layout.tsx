import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LangSync } from '@/components/LangSync';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'openant — Setup Wizard',
  description: 'Self-hosted content automation platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <LangSync />
          <div className="fixed right-4 top-4 z-50">
            <ThemeToggle />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
