import { describe, expect, it } from 'vitest';
import { enviarMailSchema } from '@/lib/validation';
import {
  checkPlantillaParaSistema,
  findPlantilla,
  parsePlantillaData,
  renderPlantilla,
} from '@/lib/mail/plantillas';

describe('plantillas', () => {
  it('escapa HTML en data y genera texto', () => {
    const p = findPlantilla('expediente_actualizacion')!;
    const data = parsePlantillaData(p, {
      numero: '1<script>',
      estado: 'ok',
      detalle: '<b>no</b>',
    });
    expect(data.ok).toBe(true);
    if (!data.ok) return;
    const r = renderPlantilla(p, data.data, 'Ana');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).not.toContain('<script>');
    expect(r.texto).toContain('Hola Ana,');
    expect(r.texto).toContain('1<script>');
    expect(r.asunto).not.toMatch(/[\r\n]/);
  });

  it('rechaza data inválida', () => {
    const p = findPlantilla('turno_confirmacion')!;
    expect(parsePlantillaData(p, { area: 'x' }).ok).toBe(false);
    expect(parsePlantillaData(p, { extra: 1 }).ok).toBe(false);
  });

  it('bloquea una plantilla de suscripción en un sistema transaccional', () => {
    const p = findPlantilla('novedad')!;
    const r = checkPlantillaParaSistema(p, { origen: 'turnos', clasificacion: 'transactional' });
    expect(r).toMatchObject({ ok: false, status: 422 });
  });

  it('restringe turno_* al origen turnos', () => {
    const p = findPlantilla('turno_confirmacion')!;
    expect(
      checkPlantillaParaSistema(p, { origen: 'expediente', clasificacion: 'transactional' })
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      checkPlantillaParaSistema(p, { origen: 'turnos', clasificacion: 'transactional' })
    ).toEqual({ ok: true });
  });
});

describe('enviarMailSchema', () => {
  it('rechaza tipo y cuerpo juntos', () => {
    const r = enviarMailSchema.safeParse({
      email: 'a@b.com',
      tipo: 'novedad',
      data: { titulo: 'x', texto: 'y' },
      asunto: 'A',
      cuerpo: '<p>x</p>',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza un asunto con salto de línea', () => {
    const r = enviarMailSchema.safeParse({
      email: 'a@b.com',
      asunto: 'Hola\nBcc: x@y.com',
      cuerpo: '<p>x</p>',
    });
    expect(r.success).toBe(false);
  });

  it('acepta tipo + data', () => {
    const r = enviarMailSchema.safeParse({
      email: 'a@b.com',
      tipo: 'novedad',
      data: { titulo: 'Hola', texto: 'Texto' },
    });
    expect(r.success).toBe(true);
  });
});
