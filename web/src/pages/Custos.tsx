import { useEffect, useState } from 'react'
import { PageHead, PageState } from '../components/Page'
import { CostChart } from '../components/CostChart'
import { getCustos, type CustoItem } from '../lib/api'
import { categoriaCor, categoriaLabel, formatCurrency, formatDate } from '../lib/format'

export function Custos() {
  const [dados, setDados] = useState<{ total: number; porCategoria: Record<string, number>; itens: CustoItem[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getCustos()
      .then((r) => vivo && setDados({ total: r.total, porCategoria: r.porCategoria, itens: r.itens }))
      .catch(() => vivo && setErro('Não consegui carregar os custos.'))
    return () => { vivo = false }
  }, [])

  const categorias = dados
    ? Object.entries(dados.porCategoria).map(([categoria, valor]) => ({ categoria, valor }))
    : []

  return (
    <section className="page">
      <PageHead eyebrow="FINANCEIRO" title="Custos" subtitle="Lançamentos por obra e categoria." />
      <PageState loading={dados === null} error={erro} empty={!!dados && dados.itens.length === 0}
        emptyMsg="Nenhum custo lançado ainda. Mande uma nota fiscal ou diga um gasto pra Rosana no WhatsApp.">
        {dados && (
          <>
            <div className="dashboard-grid">
              <section className="card">
                <div className="card-heading"><div><p className="eyebrow">TOTAL</p><h2>{formatCurrency(dados.total)}</h2></div></div>
                <div className="cat-list">
                  {categorias.sort((a, b) => b.valor - a.valor).map((c) => (
                    <div key={c.categoria} className="cat-row">
                      <span className="legend-dot" style={{ background: categoriaCor(c.categoria) }} />
                      <span>{categoriaLabel(c.categoria)}</span>
                      <strong>{formatCurrency(c.valor)}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <CostChart categorias={categorias} total={dados.total} />
            </div>

            <section className="card rdo-card" style={{ marginTop: 17 }}>
              <div className="card-heading"><div><p className="eyebrow">LANÇAMENTOS</p><h2>{dados.itens.length} registros</h2></div></div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>DATA</th><th>OBRA</th><th>CATEGORIA</th><th>DESCRIÇÃO</th><th style={{ textAlign: 'right' }}>VALOR</th></tr></thead>
                  <tbody>
                    {dados.itens.map((it) => (
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
          </>
        )}
      </PageState>
    </section>
  )
}
