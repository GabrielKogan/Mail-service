import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { config } from '@/lib/config';
import { getSesDomainStatus, sesAvailable } from '@/lib/aws/ses-account';

export const runtime = 'nodejs';

// GET /api/admin/ses-estado: DKIM, MAIL FROM, TLS y estado de la cuenta (caché de 5 min).
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!sesAvailable()) {
    return NextResponse.json({
      disponible: false,
      proveedor: config().mailProvider,
      motivo: config().awsRegion
        ? `El proveedor configurado es ${config().mailProvider}, no SES.`
        : 'Falta AWS_REGION.',
    });
  }

  try {
    const estado = await getSesDomainStatus();
    return NextResponse.json({ disponible: true, proveedor: config().mailProvider, ...estado });
  } catch (err) {
    return NextResponse.json(
      {
        disponible: false,
        proveedor: config().mailProvider,
        motivo: `No se pudo consultar SES: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    );
  }
}
