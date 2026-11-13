import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardStats, type StatsData } from '@/components/DashboardStats';

const data: StatsData = {
  total: 100,
  resumen: {
    total: 100,
    ok: 80,
    error: 20,
    entregados: 25,
    abiertos: 10,
    tasaApertura: 10,
  },
  porEstado: [
    { estado: 'enviado', cantidad: 40, porcentaje: 40 },
    { estado: 'entregado', cantidad: 25, porcentaje: 25 },
    { estado: 'abierto', cantidad: 10, porcentaje: 10 },
    { estado: 'error', cantidad: 8, porcentaje: 8 },
    { estado: 'rebotado', cantidad: 7, porcentaje: 7 },
    { estado: 'queja', cantidad: 6, porcentaje: 6 },
    { estado: 'rechazado', cantidad: 4, porcentaje: 4 },
  ],
  porOrigen: [
    { origen: 'turnos', cantidad: 50, porcentaje: 50 },
    { origen: 'tramites', cantidad: 20, porcentaje: 20 },
    { origen: 'panel', cantidad: 12, porcentaje: 12 },
    { origen: 'rentas', cantidad: 8, porcentaje: 8 },
    { origen: 'obras', cantidad: 6, porcentaje: 6 },
    { origen: 'resto', cantidad: 4, porcentaje: 4 },
  ],
  porServicio: [
    { servicio: 'Gmail', cantidad: 60, porcentaje: 60 },
    { servicio: 'Hotmail', cantidad: 30, porcentaje: 30 },
    { servicio: 'Otros', cantidad: 10, porcentaje: 10 },
  ],
  porDia: [],
  rango: { desde: null, hasta: null },
};

function listas(html: string): string[] {
  return [...html.matchAll(/<ul class="stats-pie-top">([\s\S]*?)<\/ul>/g)].map((m) => m[1]);
}

describe('tortas del dashboard', () => {
  const html = renderToStaticMarkup(
    createElement(DashboardStats, {
      data,
      loading: false,
      origenDia: '__all__',
      onOrigenDiaChange: () => {},
      desdeDia: '',
      hastaDia: '',
      onRangoDiaChange: () => {},
    })
  );
  const pies = listas(html);

  it('arma las tres tortas iguales, sin texto dentro', () => {
    expect(pies).toHaveLength(3);
    expect(html).not.toContain('recharts-legend');
    expect(html).not.toContain('enviado: 40');
    expect(html).not.toContain('Gmail: 60');
  });

  it('lista solo los cinco valores más altos con su porcentaje', () => {
    expect(pies[0]).toContain('enviado');
    expect(pies[0]).toContain('40%');
    expect(pies[0]).toContain('rebotado');
    expect(pies[0]).toContain('7%');
    expect(pies[0]).not.toContain('queja');
    expect(pies[0]).not.toContain('rechazado');

    expect(pies[1]).toContain('turnos');
    expect(pies[1]).toContain('50%');
    expect(pies[1]).toContain('obras');
    expect(pies[1]).not.toContain('resto');

    expect(pies[2]).toContain('Gmail');
    expect(pies[2]).toContain('60%');
    expect(pies[2]).toContain('Hotmail');
    expect(pies[2]).toContain('Otros');
  });
});
