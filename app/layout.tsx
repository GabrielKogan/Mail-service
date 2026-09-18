import './globals.css';
import { AppShell } from '@/components/AppShell';
import { AuthGate } from '@/components/AuthGate';

export const metadata = {
  title: 'Mail Service - Luján de Cuyo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </body>
    </html>
  );
}
