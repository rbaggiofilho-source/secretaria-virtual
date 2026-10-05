import { useEffect, useMemo, useState } from 'react'
import { PageHead, PageState } from '../components/Page'
import { cardsDeObras, ObraCrumb, ObrasDrill, SEM_OBRA } from '../components/Obras'
import { CostChart } from '../components/CostChart'
import { getCustos, getObras, type CustoItem, type ObraResumo } from '../lib/api'
import { categoriaCor, categoriaLabel, formatCurrency, formatDate } from '../lib/format'

export function Custos() {
  const [itens, setItens] = useState<CustoItem[] | null>(null)
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([getCustos(), getObras()])
      .then(([c, o]) => { if (vivo) { setItens(c.itens); setObras(o.obras) } })
      .catch(() => vivo && setErro('Não consegui carregar os custos.'))
    return () => { vivo = false }
  }, [])

  const cards = useMemo(() => cardsDeObras(obras, itens ?? [], (i) => i.obra), [obras, itens])
  const filtrados = useMemo(
    () => (itens ?? []).filter((i) => (sel === SEM_OBRA ? !i.obra : i.obra === sel)),
    [itens, sel],
  )
  const total = useMemo(() => filtrados.reduce((s, i) => s + (Number(i.valor) || 0), 0), [filtrados])
  const categorias = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of filtrados) m[i.categoria] = (m[i.categoria] ?? 0) + (Number(i.valor) || 0)
    return Object.entries(m).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
  }, [filtrados])
  const nomeSel = sel === SEM_OBRA ? 'Sem obra' : sel ?? ''

  return (
    <section className="page">
      <PageHead eyebrow="FINANCEIRO" title="Custos" subtitle="Escolha uma obra para ver os lançamentos e o total por categoria." />
      <PageState loading={itens === null} error={erro} empty={!!itens && cards.length === 0}
        emptyMsg="Nenhum custo lançado ainda. Mande uma nota fiscal ou diga um gasto pra Rosana no WhatsApp.">
        {sel === null ? (
          <ObrasDrill cards={cards} onPick={setSel} rotulo={(n) => (n === 1 ? '1 lançamento' : `${n} lançamentos`)} />
        ) : (
          <>
            <ObraCrumb nome={nomeSel} onBack={() => setSel(null)} />
            {filtrados.length === 0 ? (
              <div className="board-msg">Nenhum custo para esta obra.</div>
            ) : (
              <>
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
                      <thead><tr><th>DATA</th><th>CATEGORIA</th><th>DESCRIÇÃO</th><th style={{ textAlign: 'right' }}>VALOR</th></tr></thead>
                      <tbody>
                        {filtrados.map((it) => (
                          <tr key={it.id}>
                            <td>{formatDate(it.data)}</td>
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
          </>
        )}
      </PageState>
    </section>
  )
}
