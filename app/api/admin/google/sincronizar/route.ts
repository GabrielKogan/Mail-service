import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { syncPostmaster } from '@/lib/google/sync';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const result = await syncPostmaster();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
