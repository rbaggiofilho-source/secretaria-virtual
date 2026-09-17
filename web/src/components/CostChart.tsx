import { categoriaCor, categoriaLabel, formatCurrency } from '../lib/format'
import type { DashboardData } from '../lib/api'

export function CostChart({
  categorias,
  total,
}: {
  categorias: DashboardData['custosPorCategoria']
  total: number
}) {
  const dados = [...categorias].sort((a, b) => b.valor - a.valor)
  let accumulated = 0
  const gradient =
    total > 0
      ? dados
          .map((item) => {
            const start = (accumulated / total) * 100
            accumulated += item.valor
            return `${categoriaCor(item.categoria)} ${start}% ${(accumulated / total) * 100}%`
          })
          .join(', ')
      : '#e5e4db 0% 100%'

  return (
    <section className="card costs-card">
      <div className="card-heading"><div><p className="eyebrow">CUSTOS ACUMULADOS</p><h2>Por categoria</h2></div><select aria-label="Período"><option>Todo o período</option></select></div>
      <div className="cost-content">
        <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
          <div><small>Total investido</small><strong>{formatCurrency(total)}</strong><span>{dados.length} categoria(s)</span></div>
        </div>
        <div className="legend">
          {dados.length === 0 && <div className="empty">Nenhum custo lançado ainda.</div>}
          {dados.map((item) => (
            <div key={item.categoria}>
              <span className="legend-dot" style={{ background: categoriaCor(item.categoria) }} />
              <p>{categoriaLabel(item.categoria)}<small>{total > 0 ? Math.round((item.valor / total) * 100) : 0}% do total</small></p>
              <strong>{formatCurrency(item.valor)}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
