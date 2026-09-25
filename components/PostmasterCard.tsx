'use client';

import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '@/lib/client/token';

type Dia = {
  fecha: string;
  spamRate: number | null;
  reputacionDominio: string | null;
  spfOk: number | null;
  dkimOk: number | null;
  dmarcOk: number | null;
  tlsOk: number | null;
};

type Payload = {
  conexion: { conectado: false } | { conectado: true; email: string; estado: string; ultimaSync: string | null; ultimoError: string | null };
  ultimo: {
    fecha: string;
    dominio: string;
    spamRate: number | null;
    reputacionDominio: string | null;
    spfOk: number | null;
    dkimOk: number | null;
    dmarcOk: number | null;
    tlsOk: number | null;
  } | null;
  dias: Dia[];
  quejasSes: {
    quejas: number;
    entregas: number;
    tasa: number | null;
    porOrigen: { origen: string; cantidad: number }[];
  };
  nota: string;
};

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export function PostmasterCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await apiFetch('/api/dashboard/postmaster');
        const json = (await res.json()) as Payload & { error?: string };
        if (cancel) return;
        if (!res.ok) {
          setError(json.error || 'No se pudo cargar Postmaster');
          return;
        }
        setData(json);
      } catch {
        if (!cancel) setError('Error de red al cargar Postmaster');
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <p className="muted">Cargando Gmail (Postmaster)…</p>;

  if (!data.conexion.conectado) {
    return (
      <section className="card">
        <h2>Gmail (Postmaster Tools)</h2>
        <p className="muted">
          Sin conectar.{' '}
          <a href="/sistemas">Conectar Google en Sistemas</a>.
        </p>
      </section>
    );
  }

  const vencida = data.conexion.estado === 'vencida';
  const chart = data.dias.map((d) => ({
    fecha: String(d.fecha).slice(0, 10),
    spam: d.spamRate == null ? null : Math.round(d.spamRate * 10000) / 100,
  }));
  const ultimoSpam = data.ultimo?.spamRate ?? 0;
  const warn = ultimoSpam >= 0.001;
  const danger = ultimoSpam >= 0.003;

  return (
    <section className="card">
      <h2>Gmail (Postmaster Tools)</h2>
      {vencida ? (
        <div className="alert error">
          La conexión con Google está vencida. Reconectá desde <a href="/sistemas">Sistemas</a>.
        </div>
      ) : null}
      {danger ? (
        <div className="alert error">
          La tasa de spam de Gmail está en {pct(data.ultimo?.spamRate)} (umbral 0,3 %).
        </div>
      ) : warn ? (
        <div className="alert warn">
          La tasa de spam de Gmail está en {pct(data.ultimo?.spamRate)} (aviso desde 0,1 %).
        </div>
      ) : null}

      <div className="stats-kpis">
        <div className="stat-kpi">
          <span className="stat-kpi-label">Spam (último día)</span>
          <strong className="stat-kpi-value">{pct(data.ultimo?.spamRate)}</strong>
        </div>
        <div className="stat-kpi">
          <span className="stat-kpi-label">Reputación</span>
          <strong className="stat-kpi-value">{data.ultimo?.reputacionDominio ?? '—'}</strong>
        </div>
        <div className="stat-kpi">
          <span className="stat-kpi-label">SPF / DKIM / DMARC</span>
          <strong className="stat-kpi-value">
            {pct(data.ultimo?.spfOk)} / {pct(data.ultimo?.dkimOk)} / {pct(data.ultimo?.dmarcOk)}
          </strong>
        </div>
        <div className="stat-kpi">
          <span className="stat-kpi-label">Quejas SES (Outlook/Yahoo)</span>
          <strong className="stat-kpi-value">
            {data.quejasSes.tasa == null ? '—' : pct(data.quejasSes.tasa)}
          </strong>
          <span className="stat-kpi-sub">
            {data.quejasSes.quejas} quejas / {data.quejasSes.entregas} entregas
          </span>
        </div>
      </div>

      {chart.length ? (
        <div style={{ width: '100%', height: 220, marginTop: '1rem' }}>
          <ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
              <YAxis unit="%" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v}%`, 'Spam']} />
              <ReferenceLine y={0.1} stroke="#d97706" strokeDasharray="4 4" label="0,1 %" />
              <ReferenceLine y={0.3} stroke="#b42318" strokeDasharray="4 4" label="0,3 %" />
              <Line type="monotone" dataKey="spam" stroke="#228F8D" dot connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="muted">Todavía no hay días publicados (poco volumen hacia Gmail o primera sync pendiente).</p>
      )}

      {data.quejasSes.porOrigen.length ? (
        <p className="muted">
          Quejas de SES por origen:{' '}
          {data.quejasSes.porOrigen.map((o) => `${o.origen} (${o.cantidad})`).join(', ')}.
        </p>
      ) : null}

      <p className="muted" style={{ marginBottom: 0 }}>
        {data.nota}{' '}
        <a href="https://postmaster.google.com/" target="_blank" rel="noreferrer">
          Abrir Postmaster Tools
        </a>
        .
      </p>
    </section>
  );
}
