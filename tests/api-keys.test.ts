import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    keys: [] as Record<string, unknown>[],
    logs: [] as Record<string, unknown>[],
  };
  const prisma = {
    mail_api_key: {
      findUnique: async ({ where }: { where: { prefijo: string } }) =>
        state.keys.find((k) => k.prefijo === where.prefijo) ?? null,
      updateMany: async () => ({ count: 1 }),
    },
    mail_sistema: { findUnique: async () => null },
    mailLog: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        state.logs.find((l) => l.id === where.id) ?? null,
    },
  };
  return { state, prisma };
});

vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }));

const { authenticateApiKey, generateApiKey } = await import('@/lib/auth/api-keys');
const { resolveOrigin } = await import('@/lib/auth/caller');
const { NextRequest } = await import('next/server');
const { GET: getStatus } = await import('@/app/api/mail/[id]/route');

const sistema = (id: number, activo = true) => ({
  id,
  nombre: `Sistema ${id}`,
  origen: id === 1 ? 'turnos' : 'expediente',
  clasificacion: 'transactional',
  permiteRawHtml: true,
  corsOrigins: null,
  activo,
});

function addKey(sistemaId: number, opts: { activo?: boolean; revocada?: boolean; sistemaActivo?: boolean } = {}) {
  const k = generateApiKey();
  h.state.keys.push({
    id: h.state.keys.length + 1,
    sistemaId,
    prefijo: k.prefijo,
    hash: k.hash,
    activo: opts.activo ?? true,
    revocadaEn: opts.revocada ? new Date() : null,
    ultimoUso: null,
    sistema: sistema(sistemaId, opts.sistemaActivo ?? true),
  });
  return k.key;
}

beforeEach(() => {
  h.state.keys.length = 0;
  h.state.logs.length = 0;
});

describe('authenticateApiKey', () => {
  it('una clave válida autentica y devuelve su sistema', async () => {
    const key = addKey(1);
    expect(await authenticateApiKey(key)).toMatchObject({ sistemaId: 1, origen: 'turnos' });
  });

  it('rechaza claves revocadas, inactivas o de sistemas inactivos', async () => {
    expect(await authenticateApiKey(addKey(1, { revocada: true }))).toBeNull();
    expect(await authenticateApiKey(addKey(1, { activo: false }))).toBeNull();
    expect(await authenticateApiKey(addKey(1, { sistemaActivo: false }))).toBeNull();
  });

  it('rechaza el prefijo correcto con el resto incorrecto', async () => {
    const key = addKey(1);
    const tampered = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
    expect(await authenticateApiKey(tampered)).toBeNull();
  });
});

describe('resolveOrigin', () => {
  it('un origen distinto al de la credencial devuelve 403', async () => {
    const caller = { kind: 'system' as const, sistema: (await authenticateApiKey(addKey(1)))! };
    expect(await resolveOrigin(caller, 'expediente')).toMatchObject({ ok: false, status: 403 });
    expect(await resolveOrigin(caller, undefined)).toMatchObject({ ok: true, origen: 'turnos' });
  });
});

describe('GET /api/mail/:id', () => {
  it('no muestra registros de otro sistema', async () => {
    const key = addKey(1);
    h.state.logs.push(
      { id: 10, sistemaId: 1, estadoActual: 'entregado', messageId: 'ses-10', errorDetalle: null, fechaEnvio: new Date(), intentos: 1, mail_log_eventos: [] },
      { id: 11, sistemaId: 2, estadoActual: 'entregado', messageId: 'ses-11', errorDetalle: null, fechaEnvio: new Date(), intentos: 1, mail_log_eventos: [] }
    );
    const call = (id: number) =>
      getStatus(new NextRequest(`http://localhost/api/mail/${id}`, { headers: { 'x-api-key': key } }), {
        params: Promise.resolve({ id: String(id) }),
      });

    const own = await call(10);
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ id: 10, estado: 'entregado', messageId: 'ses-10' });
    expect((await call(11)).status).toBe(404);
  });
});
