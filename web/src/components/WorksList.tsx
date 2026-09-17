import { ArrowRight } from 'lucide-react'
import { formatCurrency, formatDate } from '../lib/format'
import type { DashboardData } from '../lib/api'

const CORES = ['#c4763b', '#497a6d', '#888f68', '#b96730', '#527c8b', '#8a6d9c']

export function WorksList({ obras }: { obras: DashboardData['obras'] }) {
  return (
    <section className="card works-card">
      <div className="card-heading"><div><p className="eyebrow">PORTFÓLIO</p><h2>Obras em destaque</h2></div><button className="text-button">Ver todas <ArrowRight size={16} /></button></div>
      <div className="works-list">
        {obras.length === 0 && (
          <div className="empty">
            Nenhuma obra ainda. Fale com a Rosana no WhatsApp — ao registrar um custo ou RDO, a obra aparece aqui.
          </div>
        )}
        {obras.slice(0, 4).map((obra, i) => {
          const cor = CORES[i % CORES.length]
          return (
            <article className="work-item" key={obra.nome}>
              <div className="work-icon" style={{ background: `${cor}18`, color: cor }}><span>⌂</span></div>
              <div className="work-main">
                <div><h3>{obra.nome}</h3><p>{obra.custos} lançamentos <span>•</span> {obra.rdos} RDOs</p></div>
                <div className="progress-label"><span>Última atividade</span><strong>{formatDate(obra.ultimaAtividade)}</strong></div>
                <div className="progress"><i style={{ width: obra.gasto > 0 ? '100%' : '0%', background: cor }} /></div>
              </div>
              <div className="work-value"><small>Investido</small><strong>{formatCurrency(obra.gasto)}</strong><span>{obra.custos} custo(s)</span></div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
