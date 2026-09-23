'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type StatsData = {
  total: number;
  resumen: {
    total: number;
    ok: number;
    error: number;
    entregados: number;
    abiertos: number;
    abiertosPorEstado?: number;
    abiertosPorEvento?: number;
    tasaApertura: number;
  };
  porEstado: { estado: string; cantidad: number; porcentaje?: number }[];
  porOrigen: { origen: string; cantidad: number; porcentaje?: number }[];
  porDia: Record<string, string | number>[];
  estadosSerie?: string[];
  origenDia?: string;
  rango: {
    desde: string | null;
    hasta: string | null;
    serieDiariaDefault30d?: boolean;
    kpisFiltrados?: boolean;
  };
  tracking?: {
    enabled: boolean;
    baseUrl: string | null;
    isPublic: boolean;
  };
};

const ESTADO_COLORS: Record<string, string> = {
  enviado: '#228F8D',
  entregado: '#1a6b8a',
  abierto: '#4eb8b5',
  error: '#b42318',
  rebotado: '#d97706',
  queja: '#9a3412',
  rechazado: '#b42318',
  suprimido: '#6b7280',
};

const ORIGEN_PALETTE = [
  '#228F8D',
  '#1a6b8a',
  '#4eb8b5',
  '#145c5b',
  '#5b8a8a',
  '#0f766e',
  '#3b82a0',
  '#7ec9c7',
];

type Props = {
  data: StatsData | null;
  loading: boolean;
  origenDia: string;
  onOrigenDiaChange: (origen: string) => void;
};

function pctOf(n: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((n / total) * 1000) / 10}%`;
}

export function DashboardStats({
  data,
  loading,
  origenDia,
  onOrigenDiaChange,
}: Props) {
  if (loading) {
    return <p className="muted">Cargando estadísticas…</p>;
  }

  if (!data || data.total === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          No hay datos para graficar con esos filtros.
        </p>
      </div>
    );
  }

  const { resumen, porEstado, porOrigen, porDia, estadosSerie, rango, tracking } =
    data;
  const origenTop = porOrigen.slice(0, 10);
  const origenOptions = [
    { value: '__all__', label: 'Todos los orígenes' },
    ...porOrigen.map((o) => ({ value: o.origen, label: o.origen })),
  ];
  if (
    origenDia !== '__all__' &&
    !origenOptions.some((o) => o.value === origenDia)
  ) {
    origenOptions.push({ value: origenDia, label: origenDia });
  }
  const sinAperturas =
    resumen.abiertos === 0 &&
    !porEstado.some((e) => e.estado === 'abierto' && e.cantidad > 0);

  const serieEstados =
    estadosSerie && estadosSerie.length > 0
      ? estadosSerie
      : [...new Set(porEstado.map((e) => e.estado))];

  const totalSerie = porDia.reduce(
    (s, d) => s + Number(d.cantidad ?? 0),
    0
  );

  return (
    <div className="stats">
      {tracking && !tracking.isPublic ? (
        <div className="alert warn">
          El tracking de apertura usa{' '}
          <span className="code">{tracking.baseUrl || '(sin URL)'}</span>. Los
          clientes de mail (Gmail, etc.) <strong>no pueden cargar localhost</strong>
          : por eso abrir el mail no marca &quot;abierto&quot; en las stats.
          Poné una URL pública en <span className="code">APP_BASE_URL</span>{' '}
          (ngrok o el servidor) y <strong>volvé a enviar</strong> el mail.
        </div>
      ) : null}

      {sinAperturas ? (
        <div className="alert warn">
          Todavía no hay mails con estado/evento <strong>abierto</strong>. El
          envío queda en <strong>enviado</strong> hasta que el píxel (o SES)
          reporte la apertura.
        </div>
      ) : null}

      <p className="muted" style={{ marginTop: 0 }}>
        Resumen de mails enviados, estados y orígenes
        {rango.kpisFiltrados ? ' (filtros actuales)' : ''}. Serie diaria:{' '}
        {rango.serieDiariaDefault30d
          ? 'últimos 30 días'
          : `${rango.desde ?? '…'} → ${rango.hasta ?? '…'}`}
        .
      </p>

      <div className="stats-kpis">
        <div className="stat-kpi">
          <span className="stat-kpi-label">Mails enviados (total)</span>
          <strong className="stat-kpi-value">{resumen.total}</strong>
        </div>
        <div className="stat-kpi">
          <span className="stat-kpi-label">OK (sin error)</span>
          <strong className="stat-kpi-value">{resumen.ok}</strong>
          <span className="stat-kpi-sub">{pctOf(resumen.ok, resumen.total)}</span>
        </div>
        <div className="stat-kpi">
          <span className="stat-kpi-label">Con error / rebote</span>
          <strong className="stat-kpi-value">{resumen.error}</strong>
          <span className="stat-kpi-sub">
            {pctOf(resumen.error, resumen.total)}
          </span>
        </div>
        <div className="stat-kpi">
          <span className="stat-kpi-label">Entregados</span>
          <strong className="stat-kpi-value">{resumen.entregados}</strong>
          <span className="stat-kpi-sub">
            {pctOf(resumen.entregados, resumen.total)}
          </span>
        </div>
        <div className="stat-kpi">
          <span className="stat-kpi-label">Abiertos</span>
          <strong className="stat-kpi-value">{resumen.abiertos}</strong>
          <span className="stat-kpi-sub">
            {pctOf(resumen.abiertos, resumen.total)}
          </span>
        </div>
        <div className="stat-kpi">
          <span className="stat-kpi-label">Tasa apertura</span>
          <strong className="stat-kpi-value">{resumen.tasaApertura}%</strong>
        </div>
      </div>

      <div className="stats-grid">
        <section className="card stats-card">
          <h2 className="stats-card-title">Estados — cantidad y %</h2>
          <div className="stats-chart">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={porEstado}
                  dataKey="cantidad"
                  nameKey="estado"
                  cx="50%"
                  cy="50%"
                  outerRadius={88}
                  innerRadius={42}
                  paddingAngle={2}
                  label={(props) => {
                    const name = String(props.name ?? '');
                    const value = Number(props.value ?? 0);
                    const pct = ((props.percent ?? 0) * 100).toFixed(0);
                    return `${name}: ${value} (${pct}%)`;
                  }}
                >
                  {porEstado.map((entry) => (
                    <Cell
                      key={entry.estado}
                      fill={ESTADO_COLORS[entry.estado] ?? '#5c6b63'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    `${typeof value === 'number' ? value : Number(value)} mails`,
                    String(name),
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap stats-mini-table">
            <table>
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Cantidad</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {porEstado.map((row) => (
                  <tr key={row.estado}>
                    <td>
                      <span className={`badge ${row.estado === 'error' || row.estado === 'rebotado' || row.estado === 'queja' || row.estado === 'rechazado' || row.estado === 'suprimido' ? 'error' : row.estado === 'abierto' ? 'abierto' : row.estado === 'entregado' ? 'entregado' : 'enviado'}`}>
                        {row.estado}
                      </span>
                    </td>
                    <td>{row.cantidad}</td>
                    <td>
                      {row.porcentaje ??
                        Math.round((row.cantidad / resumen.total) * 1000) / 10}
                      %
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>{resumen.total}</strong>
                  </td>
                  <td>
                    <strong>100%</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stats-card">
          <h2 className="stats-card-title">Origen de los mails — cantidad</h2>
          <div className="stats-chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={origenTop}
                layout="vertical"
                margin={{ left: 8, right: 36, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="origen"
                  width={110}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => [
                    `${typeof value === 'number' ? value : Number(value)} mails`,
                    'Cantidad',
                  ]}
                />
                <Bar dataKey="cantidad" name="Mails" radius={[0, 4, 4, 0]}>
                  {origenTop.map((entry, i) => (
                    <Cell
                      key={entry.origen}
                      fill={ORIGEN_PALETTE[i % ORIGEN_PALETTE.length]}
                    />
                  ))}
                  <LabelList dataKey="cantidad" position="right" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap stats-mini-table">
            <table>
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Cantidad</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {porOrigen.map((row) => (
                  <tr key={row.origen}>
                    <td>{row.origen}</td>
                    <td>{row.cantidad}</td>
                    <td>
                      {row.porcentaje ??
                        Math.round((row.cantidad / resumen.total) * 1000) / 10}
                      %
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>{resumen.total}</strong>
                  </td>
                  <td>
                    <strong>100%</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stats-card stats-card-wide">
          <div className="stats-card-header">
            <h2 className="stats-card-title">
              Mails por día (total + estados)
            </h2>
            <label className="stats-inline-filter">
              Origen
              <select
                value={origenDia}
                onChange={(e) => onOrigenDiaChange(e.target.value)}
              >
                {origenOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
            Barras apiladas por estado y línea de total. Filtro de origen solo
            para este gráfico
            {origenDia !== '__all__' ? ` (${origenDia})` : ''}. Envíos en
            serie: <strong>{totalSerie}</strong>.
          </p>
          <div className="stats-chart">
            {porDia.length === 0 ? (
              <p className="muted">
                No hay envíos en este rango para ese origen.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart
                  data={porDia}
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e3" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    formatter={(value, name) => [
                      `${typeof value === 'number' ? value : Number(value)}`,
                      String(name),
                    ]}
                  />
                  <Legend />
                  {serieEstados.map((est) => (
                    <Bar
                      key={est}
                      dataKey={est}
                      name={est}
                      stackId="estados"
                      fill={ESTADO_COLORS[est] ?? '#5c6b63'}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {porDia.length > 0 ? (
            <>
              <div className="stats-chart" style={{ marginTop: '1rem' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={porDia}
                    margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e3" />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fontSize: 11 }}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="cantidad"
                      name="Total enviados"
                      stroke="#228F8D"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    >
                      <LabelList dataKey="cantidad" position="top" />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrap stats-mini-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Total</th>
                      {serieEstados.map((est) => (
                        <th key={est}>{est}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {porDia.map((row) => (
                      <tr key={String(row.fecha)}>
                        <td>{row.fecha}</td>
                        <td>
                          <strong>{row.cantidad}</strong>
                        </td>
                        {serieEstados.map((est) => (
                          <td key={est}>{row[est] ?? 0}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
