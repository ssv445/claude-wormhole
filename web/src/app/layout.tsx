import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PushRegistrar } from '@/components/PushRegistrar';

export const metadata: Metadata = {
  title: 'Claude Wormhole',
  description: 'Remote Claude Code session management',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Claude Wormhole',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
};

// Inline script to set theme class before first paint (no FOUC).
// Content is a static string constant — no user input, safe from XSS.
const themeScript = `(function(){try{var t=localStorage.getItem('tmux-theme');if(t==='light')document.body.classList.add('light')}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        <PushRegistrar />
      </body>
    </html>
  );
}
