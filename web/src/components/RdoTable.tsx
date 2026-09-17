import { ArrowRight, Cloud, CloudRain, Sun } from 'lucide-react'
import { rdos } from '../data/mockData'

const weatherIcon = { Ensolarado: Sun, Nublado: Cloud, Chuvoso: CloudRain }

export function RdoTable() {
  return (
    <section className="card rdo-card">
      <div className="card-heading"><div><p className="eyebrow">ACOMPANHAMENTO DIÁRIO</p><h2>Registros recentes</h2></div><button className="text-button">Ver diário completo <ArrowRight size={16} /></button></div>
      <div className="table-scroll"><table><thead><tr><th>DATA / REGISTRO</th><th>OBRA</th><th>CLIMA</th><th>EFETIVO</th><th>ATIVIDADE PRINCIPAL</th><th>STATUS</th></tr></thead>
        <tbody>{rdos.map((rdo) => { const Weather = weatherIcon[rdo.clima]; return <tr key={rdo.id}><td><strong>{rdo.data}</strong><small>{rdo.id}</small></td><td>{rdo.obra}</td><td><span className="weather"><Weather size={17} /> {rdo.clima}</span></td><td><strong>{rdo.efetivo}</strong> pessoas</td><td>{rdo.atividade}</td><td><span className={`status ${rdo.status.toLowerCase()}`}>{rdo.status}</span></td></tr> })}</tbody>
      </table></div>
    </section>
  )
}
