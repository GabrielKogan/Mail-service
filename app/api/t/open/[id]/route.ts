import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordMailEvent } from '@/lib/mail/events';
import { verifyOpenToken } from '@/lib/mail/tracking';

/** GIF 1x1 transparente. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  const token = req.nextUrl.searchParams.get('t') ?? '';

  if (Number.isInteger(id) && id > 0 && verifyOpenToken(id, token)) {
    const log = await prisma.mailLog.findUnique({
      where: { id },
      select: { id: true, estadoActual: true },
    });

    if (log) {
      const alreadyOpen = await prisma.mail_log_eventos.findFirst({
        where: { mail_log_id: id, evento: 'apertura' },
        select: { id: true },
      });

      if (!alreadyOpen) {
        const ip =
          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          req.headers.get('x-real-ip') ||
          null;
        const userAgent = req.headers.get('user-agent');

        try {
          await recordMailEvent({
            mailLogId: id,
            evento: 'apertura',
            ip,
            userAgent,
            nuevoEstado: 'abierto',
          });
        } catch {
          // No fallar el píxel si el log de evento falla.
        }
      }
    }
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Content-Length': String(PIXEL.length),
    },
  });
}
