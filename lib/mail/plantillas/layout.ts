import { getMailFrom } from '../from';

/** Contenido estructurado de un correo: el layout lo convierte a HTML y a texto. */
export type Contenido = {
  titulo: string;
  parrafos: string[];
  datos?: { etiqueta: string; valor: string }[];
  lista?: string[];
  accion?: { texto: string; url: string };
  nota?: string;
};

const MUNICIPIO = 'Municipalidad de Luján de Cuyo';
const SITIO = 'https://www.lujandecuyo.gob.ar';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Un texto con saltos de línea: párrafos separados por línea en blanco, `<br>` en los simples. */
function parrafoHtml(p: string): string {
  return p
    .split(/\n{2,}/)
    .map((bloque) => bloque.trim())
    .filter(Boolean)
    .map(
      (bloque) =>
        `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(bloque).replace(/\n/g, '<br>')}</p>`
    )
    .join('');
}

export function saludo(nombre: string): string {
  const n = nombre.trim();
  return n ? `Hola ${n},` : 'Hola,';
}

export function renderHtml(c: Contenido, nombre: string): string {
  const from = getMailFrom();
  const datos = c.datos?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse">${c.datos
        .map(
          (d) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${escapeHtml(d.etiqueta)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(d.valor)}</td></tr>`
        )
        .join('')}</table>`
    : '';
  const lista = c.lista?.length
    ? `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${c.lista
        .map((i) => `<li>${escapeHtml(i)}</li>`)
        .join('')}</ul>`
    : '';
  const accion = c.accion
    ? `<p style="margin:8px 0 18px"><a href="${escapeHtml(c.accion.url)}" style="display:inline-block;background:#12504f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">${escapeHtml(c.accion.texto)}</a></p>`
    : '';
  const nota = c.nota
    ? `<p style="margin:0 0 14px;font-size:13px;color:#555">${escapeHtml(c.nota)}</p>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.titulo)}</title></head>
<body style="margin:0;padding:0;background:#f3f6f6;font-family:Arial,Helvetica,sans-serif;color:#1d2b2b">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="background:#12504f;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0;font-weight:600">${MUNICIPIO}</div>
<div style="background:#fff;padding:22px 20px;border-radius:0 0 8px 8px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(c.titulo)}</h1>
<p style="margin:0 0 14px">${escapeHtml(saludo(nombre))}</p>
${c.parrafos.map(parrafoHtml).join('')}
${datos}${lista}${accion}${nota}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#667;text-align:center">${MUNICIPIO} · <a href="${SITIO}" style="color:#667">${SITIO.replace('https://', '')}</a> · Consultas: ${escapeHtml(from.email)}</p>
</div>
</body></html>`;
}

export function renderTexto(c: Contenido, nombre: string): string {
  const from = getMailFrom();
  const partes: string[] = [c.titulo, '', saludo(nombre), ''];
  for (const p of c.parrafos) partes.push(p.trim(), '');
  if (c.datos?.length) {
    for (const d of c.datos) partes.push(`${d.etiqueta}: ${d.valor}`);
    partes.push('');
  }
  if (c.lista?.length) {
    for (const i of c.lista) partes.push(`- ${i}`);
    partes.push('');
  }
  if (c.accion) partes.push(`${c.accion.texto}: ${c.accion.url}`, '');
  if (c.nota) partes.push(c.nota, '');
  partes.push('--', MUNICIPIO, SITIO, `Consultas: ${from.email}`);
  return partes.join('\n');
}
