import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/mail/sistemas', () => ({ clasificacionDe: async () => 'transactional' }));

const { reactivationRule } = await import('@/lib/mail/suppression');

describe('reactivationRule', () => {
  it('sin responsable responde 400', () => {
    const r = reactivationRule('baja', { responsable: '   ' });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('una baja se reactiva con solo el responsable', () => {
    expect(reactivationRule('baja', { responsable: 'Ana Pérez' })).toEqual({
      ok: true,
      responsable: 'Ana Pérez',
      nota: null,
    });
  });

  it.each(['rebote', 'queja'])('%s sin confirmación responde 409', (motivo) => {
    const r = reactivationRule(motivo, { responsable: 'Ana', nota: 'Llamó el vecino y confirmó' });
    expect(r).toMatchObject({ ok: false, status: 409, requiereConfirmacion: true });
  });

  it.each(['rebote', 'queja'])('%s confirmado con nota corta responde 400', (motivo) => {
    const r = reactivationRule(motivo, { responsable: 'Ana', confirmar: true, nota: 'ok' });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('una queja confirmada con nota suficiente se reactiva', () => {
    const r = reactivationRule('queja', {
      responsable: 'Ana',
      confirmar: true,
      nota: 'El vecino pidió por mesa de entradas volver a recibir avisos',
    });
    expect(r).toMatchObject({ ok: true, responsable: 'Ana' });
  });

  it('confirmar tiene que ser true, no un texto', () => {
    const r = reactivationRule('rebote', {
      responsable: 'Ana',
      confirmar: 'true',
      nota: 'Dirección verificada por teléfono',
    });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
});
