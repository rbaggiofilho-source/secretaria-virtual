import { useEffect, useMemo, useState } from 'react'
import { PageHead, PageState } from '../components/Page'
import { cardsDeObras, ObraCrumb, ObrasDrill, SEM_OBRA } from '../components/Obras'
import { getMateriais, getObras, type MaterialItem, type ObraResumo } from '../lib/api'
import { formatCurrency, materialStatusLabel } from '../lib/format'

const STATUS = ['a_comprar', 'cotando', 'comprado', 'entregue', 'cancelado']

export function Materiais() {
  const [mats, setMats] = useState<MaterialItem[] | null>(null)
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let vivo = true
    Promise.all([getMateriais(), getObras()])
      .then(([m, o]) => { if (vivo) { setMats(m.materiais); setObras(o.obras) } })
      .catch(() => vivo && setErro('Não consegui carregar os materiais.'))
    return () => { vivo = false }
  }, [])

  const cards = useMemo(() => cardsDeObras(obras, mats ?? [], (m) => m.obra), [obras, mats])
  const filtrados = useMemo(
    () => (mats ?? []).filter((m) => (sel === SEM_OBRA ? !m.obra : m.obra === sel) && (!status || m.status === status)),
    [mats, sel, status],
  )
  const nomeSel = sel === SEM_OBRA ? 'Sem obra' : sel ?? ''

  return (
    <section className="page">
      <PageHead eyebrow="COMPRAS & COTAÇÕES" title="Materiais" subtitle="Escolha uma obra para ver os itens, do 'a comprar' ao 'entregue'." />
      <PageState loading={mats === null} error={erro} empty={!!mats && cards.length === 0}
        emptyMsg="Nenhum material ainda. Diga à Rosana o que precisa comprar e as cotações que for recebendo.">
        {sel === null ? (
          <ObrasDrill cards={cards} onPick={setSel} rotulo={(n) => (n === 1 ? '1 item' : `${n} itens`)} />
        ) : (
          <>
            <ObraCrumb nome={nomeSel} onBack={() => setSel(null)}
              right={
                <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
                  <option value="">Todos os status</option>
                  {STATUS.map((s) => <option key={s} value={s}>{materialStatusLabel(s)}</option>)}
                </select>
              } />
            {filtrados.length === 0 ? (
              <div className="board-msg">{status ? 'Nenhum material com esse status.' : 'Nenhum material para esta obra.'}</div>
            ) : (
              <section className="card rdo-card">
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>ITEM</th><th>STATUS</th><th>FORNECEDOR</th><th>COTAÇÕES</th><th style={{ textAlign: 'right' }}>VALOR</th></tr></thead>
                    <tbody>
                      {filtrados.map((m) => (
                        <tr key={m.id}>
                          <td><strong>{m.item}</strong>{m.quantidade ? <small> · {m.quantidade}{m.unidade ? ` ${m.unidade}` : ''}</small> : null}</td>
                          <td><span className={`mat-status mat-status--${m.status}`}>{materialStatusLabel(m.status)}</span></td>
                          <td>{m.fornecedor ?? '—'}</td>
                          <td>{m.cotacoes?.length ? `${m.cotacoes.length} cotação(ões)` : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{m.valor_total != null ? formatCurrency(m.valor_total) : m.valor_unitario != null ? formatCurrency(m.valor_unitario) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </PageState>
    </section>
  )
}
