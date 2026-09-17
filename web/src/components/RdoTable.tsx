import { ArrowRight, Cloud, CloudRain, CloudSun, Sun } from 'lucide-react'
import { formatDate } from '../lib/format'
import type { DashboardData } from '../lib/api'

function WeatherIcon({ clima }: { clima: string | null }) {
  const c = (clima ?? '').toLowerCase()
  if (c.includes('chuv')) return <CloudRain size={17} />
  if (c.includes('nubl') || c.includes('encob')) return <Cloud size={17} />
  if (c.includes('parc') || c.includes('sol e nuv')) return <CloudSun size={17} />
  if (c.includes('sol') || c.includes('limp')) return <Sun size={17} />
  return <CloudSun size={17} />
}

export function RdoTable({ rdos }: { rdos: DashboardData['rdos'] }) {
  return (
    <section className="card rdo-card">
      <div className="card-heading"><div><p className="eyebrow">ACOMPANHAMENTO DIÁRIO</p><h2>Registros recentes</h2></div><button className="text-button">Ver diário completo <ArrowRight size={16} /></button></div>
      <div className="table-scroll">
        {rdos.length === 0 ? (
          <div className="empty" style={{ padding: '28px 20px' }}>
            Nenhum Diário de Obra ainda. Mande um áudio pra Rosana descrevendo o dia da obra que ela registra aqui.
          </div>
        ) : (
          <table>
            <thead><tr><th>DATA / REGISTRO</th><th>OBRA</th><th>CLIMA</th><th>EFETIVO</th><th>ATIVIDADE PRINCIPAL</th></tr></thead>
            <tbody>
              {rdos.map((rdo) => (
                <tr key={rdo.id}>
                  <td><strong>{formatDate(rdo.data)}</strong><small>RDO-{rdo.id}</small></td>
                  <td>{rdo.obra}</td>
                  <td><span className="weather"><WeatherIcon clima={rdo.clima} /> {rdo.clima ?? '—'}</span></td>
                  <td><strong>{rdo.efetivo}</strong> pessoas</td>
                  <td>{rdo.atividades ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
