import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiInstance, brevo } from '@/lib/brevo';
import { enviarMailSchema } from '@/lib/validation';
import { isAuthorized } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = enviarMailSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', detalle: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, nombre, asunto, cuerpo, origen } = parsed.data;

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.sender = {
    name: 'Municipalidad de Lujan de Cuyo',
    email: 'registro@lujandecuyo.gob.ar',
  };
  sendSmtpEmail.to = [{ email, name: nombre || email }];
  sendSmtpEmail.subject = asunto;
  sendSmtpEmail.htmlContent = cuerpo;

  try {
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    const messageId = (response.body as any).messageId as string;

    const log = await prisma.mailLog.create({
      data: {
        messageId,
        destinatario: email,
        nombreDest: nombre,
        asunto,
        cuerpo,
        origen,
        estadoActual: 'enviado',
      },
    });

    return NextResponse.json({ ok: true, id: log.id, messageId });
  } catch (err: any) {
    await prisma.mailLog.create({
      data: {
        messageId: `error-${Date.now()}`,
        destinatario: email,
        nombreDest: nombre,
        asunto,
        cuerpo,
        origen,
        estadoActual: 'error',
        errorDetalle: err?.response?.body?.message ?? err.message ?? 'Error desconocido',
      },
    });

    return NextResponse.json({ error: 'No se pudo enviar el mail' }, { status: 502 });
  }
}
