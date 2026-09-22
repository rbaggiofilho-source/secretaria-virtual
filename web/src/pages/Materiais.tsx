import { useEffect, useMemo, useState } from 'react'
import { ObraSelect, PageHead, PageState } from '../components/Page'
import { getMateriais, type MaterialItem } from '../lib/api'
import { formatCurrency, materialStatusLabel } from '../lib/format'

const STATUS = ['a_comprar', 'cotando', 'comprado', 'entregue', 'cancelado']

export function Materiais() {
  const [mats, setMats] = useState<MaterialItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [obra, setObra] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let vivo = true
    getMateriais()
      .then((r) => vivo && setMats(r.materiais))
      .catch(() => vivo && setErro('Não consegui carregar os materiais.'))
    return () => { vivo = false }
  }, [])

  const obras = useMemo(() => [...new Set((mats ?? []).map((m) => m.obra).filter(Boolean) as string[])], [mats])
  const filtrados = useMemo(
    () => (mats ?? []).filter((m) => (!obra || m.obra === obra) && (!status || m.status === status)),
    [mats, obra, status],
  )

  return (
    <section className="page">
      <PageHead eyebrow="COMPRAS & COTAÇÕES" title="Materiais" subtitle="Itens de cada obra, do 'a comprar' ao 'entregue'."
        right={
          <>
            <ObraSelect obras={obras} value={obra} onChange={setObra} />
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
              <option value="">Todos os status</option>
              {STATUS.map((s) => <option key={s} value={s}>{materialStatusLabel(s)}</option>)}
            </select>
          </>
        } />
      <PageState loading={mats === null} error={erro} empty={!!mats && filtrados.length === 0}
        emptyMsg={obra || status ? 'Nenhum material com esses filtros.' : 'Nenhum material ainda. Diga à Rosana o que precisa comprar e as cotações que for recebendo.'}>
        <section className="card rdo-card">
          <div className="table-scroll">
            <table>
              <thead><tr><th>ITEM</th><th>OBRA</th><th>STATUS</th><th>FORNECEDOR</th><th>COTAÇÕES</th><th style={{ textAlign: 'right' }}>VALOR</th></tr></thead>
              <tbody>
                {filtrados.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.item}</strong>{m.quantidade ? <small> · {m.quantidade}{m.unidade ? ` ${m.unidade}` : ''}</small> : null}</td>
                    <td>{m.obra ?? '—'}</td>
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
      </PageState>
    </section>
  )
}
