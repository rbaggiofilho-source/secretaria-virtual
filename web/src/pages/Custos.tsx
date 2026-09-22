import { useEffect, useMemo, useState } from 'react'
import { ObraSelect, PageHead, PageState } from '../components/Page'
import { CostChart } from '../components/CostChart'
import { getCustos, type CustoItem } from '../lib/api'
import { categoriaCor, categoriaLabel, formatCurrency, formatDate } from '../lib/format'

export function Custos() {
  const [itens, setItens] = useState<CustoItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [obra, setObra] = useState('')

  useEffect(() => {
    let vivo = true
    getCustos()
      .then((r) => vivo && setItens(r.itens))
      .catch(() => vivo && setErro('Não consegui carregar os custos.'))
    return () => { vivo = false }
  }, [])

  const obras = useMemo(() => [...new Set((itens ?? []).map((i) => i.obra).filter(Boolean) as string[])], [itens])
  const filtrados = useMemo(() => (obra ? (itens ?? []).filter((i) => i.obra === obra) : itens ?? []), [itens, obra])
  const total = useMemo(() => filtrados.reduce((s, i) => s + (Number(i.valor) || 0), 0), [filtrados])
  const categorias = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of filtrados) m[i.categoria] = (m[i.categoria] ?? 0) + (Number(i.valor) || 0)
    return Object.entries(m).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
  }, [filtrados])

  return (
    <section className="page">
      <PageHead eyebrow="FINANCEIRO" title="Custos" subtitle="Lançamentos por obra e categoria."
        right={<ObraSelect obras={obras} value={obra} onChange={setObra} />} />
      <PageState loading={itens === null} error={erro} empty={!!itens && filtrados.length === 0}
        emptyMsg={obra ? 'Nenhum custo para esta obra.' : 'Nenhum custo lançado ainda. Mande uma nota fiscal ou diga um gasto pra Rosana no WhatsApp.'}>
        <div className="dashboard-grid">
          <section className="card">
            <div className="card-heading"><div><p className="eyebrow">TOTAL</p><h2>{formatCurrency(total)}</h2></div></div>
            <div className="cat-list">
              {categorias.map((c) => (
                <div key={c.categoria} className="cat-row">
                  <span className="legend-dot" style={{ background: categoriaCor(c.categoria) }} />
                  <span>{categoriaLabel(c.categoria)}</span>
                  <strong>{formatCurrency(c.valor)}</strong>
                </div>
              ))}
            </div>
          </section>
          <CostChart categorias={categorias} total={total} />
        </div>

        <section className="card rdo-card" style={{ marginTop: 17 }}>
          <div className="card-heading"><div><p className="eyebrow">LANÇAMENTOS</p><h2>{filtrados.length} registros</h2></div></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>DATA</th><th>OBRA</th><th>CATEGORIA</th><th>DESCRIÇÃO</th><th style={{ textAlign: 'right' }}>VALOR</th></tr></thead>
              <tbody>
                {filtrados.map((it) => (
                  <tr key={it.id}>
                    <td>{formatDate(it.data)}</td>
                    <td>{it.obra ?? '—'}</td>
                    <td><span className="tag" style={{ color: categoriaCor(it.categoria), background: `${categoriaCor(it.categoria)}1e` }}>{categoriaLabel(it.categoria)}</span></td>
                    <td>{it.descricao ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(it.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </PageState>
    </section>
  )
}
