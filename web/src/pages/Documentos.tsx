import { useEffect, useMemo, useState } from 'react'
import { PageHead, PageState } from '../components/Page'
import { cardsDeObras, ObraCrumb, ObrasDrill, SEM_OBRA } from '../components/Obras'
import { getDocumentos, getObras, type DocumentoItem, type ObraResumo } from '../lib/api'
import { formatDate, tipoDocLabel } from '../lib/format'

function statusVencimento(venc: string | null): { label: string; cls: string } {
  if (!venc) return { label: 'Sem prazo', cls: 'neutro' }
  const dias = Math.ceil((new Date(`${venc}T00:00:00`).getTime() - Date.now()) / 86400000)
  if (dias < 0) return { label: `Vencido há ${Math.abs(dias)}d`, cls: 'vencido' }
  if (dias <= 15) return { label: `Vence em ${dias}d`, cls: 'proximo' }
  return { label: `Em ${dias}d`, cls: 'ok' }
}

export function Documentos() {
  const [docs, setDocs] = useState<DocumentoItem[] | null>(null)
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([getDocumentos(), getObras()])
      .then(([d, o]) => { if (vivo) { setDocs(d.documentos); setObras(o.obras) } })
      .catch(() => vivo && setErro('Não consegui carregar os documentos.'))
    return () => { vivo = false }
  }, [])

  const cards = useMemo(() => cardsDeObras(obras, docs ?? [], (d) => d.obra), [obras, docs])
  const filtrados = useMemo(
    () => (docs ?? []).filter((d) => (sel === SEM_OBRA ? !d.obra : d.obra === sel)),
    [docs, sel],
  )
  const nomeSel = sel === SEM_OBRA ? 'Sem obra' : sel ?? ''

  return (
    <section className="page">
      <PageHead eyebrow="PRAZOS & DOCUMENTOS" title="Documentos" subtitle="Alvará, ART/RRT, ASO, licenças e outros prazos, por obra." />
      <PageState loading={docs === null} error={erro} empty={!!docs && cards.length === 0}
        emptyMsg="Nenhum documento ainda. Diga à Rosana os prazos da obra (ex.: 'alvará vence dia 30/10') que ela guarda e lembra você.">
        {sel === null ? (
          <ObrasDrill cards={cards} onPick={setSel} rotulo={(n) => (n === 1 ? '1 documento' : `${n} documentos`)} />
        ) : (
          <>
            <ObraCrumb nome={nomeSel} onBack={() => setSel(null)} />
            {filtrados.length === 0 ? (
              <div className="board-msg">Nenhum documento para esta obra.</div>
            ) : (
              <section className="card rdo-card">
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>TIPO</th><th>DESCRIÇÃO</th><th>VENCIMENTO</th><th>SITUAÇÃO</th></tr></thead>
                    <tbody>
                      {filtrados.map((d) => {
                        const sv = statusVencimento(d.vencimento)
                        return (
                          <tr key={d.id}>
                            <td><span className="tag">{tipoDocLabel(d.tipo)}</span></td>
                            <td>{d.descricao}{d.numero ? <small> · nº {d.numero}</small> : null}</td>
                            <td>{formatDate(d.vencimento)}</td>
                            <td><span className={`prazo prazo--${sv.cls}`}>{sv.label}</span></td>
                          </tr>
                        )
                      })}
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
