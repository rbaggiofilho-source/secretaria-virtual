import { useEffect, useState } from 'react'
import { PageHead, PageState } from '../components/Page'
import { getMateriais, type MaterialItem } from '../lib/api'
import { formatCurrency, materialStatusLabel } from '../lib/format'

export function Materiais() {
  const [mats, setMats] = useState<MaterialItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getMateriais()
      .then((r) => vivo && setMats(r.materiais))
      .catch(() => vivo && setErro('Não consegui carregar os materiais.'))
    return () => { vivo = false }
  }, [])

  return (
    <section className="page">
      <PageHead eyebrow="COMPRAS & COTAÇÕES" title="Materiais" subtitle="Itens de cada obra, do 'a comprar' ao 'entregue'." />
      <PageState loading={mats === null} error={erro} empty={!!mats && mats.length === 0}
        emptyMsg="Nenhum material ainda. Diga à Rosana o que precisa comprar e as cotações que for recebendo.">
        <section className="card rdo-card">
          <div className="table-scroll">
            <table>
              <thead><tr><th>ITEM</th><th>OBRA</th><th>STATUS</th><th>FORNECEDOR</th><th>COTAÇÕES</th><th style={{ textAlign: 'right' }}>VALOR</th></tr></thead>
              <tbody>
                {mats?.map((m) => (
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
