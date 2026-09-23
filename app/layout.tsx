import './globals.css';
import { DM_Sans } from 'next/font/google';
import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata = {
  title: 'Mail Service - Luján de Cuyo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={dmSans.variable}>
      <body className={dmSans.className}>
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </body>
    </html>
  );
}
