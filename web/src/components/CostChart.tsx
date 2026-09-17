import { custos, formatCurrency } from '../data/mockData'

export function CostChart() {
  const total = custos.reduce((sum, item) => sum + item.valor, 0)
  let accumulated = 0
  const gradient = custos.map((item) => {
    const start = (accumulated / total) * 100
    accumulated += item.valor
    return `${item.cor} ${start}% ${(accumulated / total) * 100}%`
  }).join(', ')

  return (
    <section className="card costs-card">
      <div className="card-heading"><div><p className="eyebrow">CUSTOS ACUMULADOS</p><h2>Por categoria</h2></div><select aria-label="Período"><option>Este mês</option><option>Últimos 3 meses</option></select></div>
      <div className="cost-content">
        <div className="donut" style={{ background: `conic-gradient(${gradient})` }}><div><small>Total investido</small><strong>{formatCurrency(total)}</strong><span>+8,4% neste mês</span></div></div>
        <div className="legend">
          {custos.map((item) => <div key={item.nome}><span className="legend-dot" style={{ background: item.cor }} /><p>{item.nome}<small>{Math.round(item.valor / total * 100)}% do total</small></p><strong>{formatCurrency(item.valor)}</strong></div>)}
        </div>
      </div>
    </section>
  )
}
