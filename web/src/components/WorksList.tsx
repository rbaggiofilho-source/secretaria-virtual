import { ArrowRight } from 'lucide-react'
import { formatCurrency, obras } from '../data/mockData'

export function WorksList() {
  return (
    <section className="card works-card">
      <div className="card-heading"><div><p className="eyebrow">PORTFÓLIO</p><h2>Obras em destaque</h2></div><button className="text-button">Ver todas <ArrowRight size={16} /></button></div>
      <div className="works-list">
        {obras.map((obra) => (
          <article className="work-item" key={obra.id}>
            <div className="work-icon" style={{ background: `${obra.cor}18`, color: obra.cor }}><span>⌂</span></div>
            <div className="work-main"><div><h3>{obra.nome}</h3><p>{obra.local} <span>•</span> {obra.status}</p></div><div className="progress-label"><span>Progresso</span><strong>{obra.progresso}%</strong></div><div className="progress"><i style={{ width: `${obra.progresso}%`, background: obra.cor }} /></div></div>
            <div className="work-value"><small>Investido</small><strong>{formatCurrency(obra.gasto)}</strong><span>de {formatCurrency(obra.orcamento)}</span></div>
          </article>
        ))}
      </div>
    </section>
  )
}
