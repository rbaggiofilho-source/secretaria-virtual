import { useEffect, useMemo, useState } from 'react'
import { ObraSelect, PageHead, PageState } from '../components/Page'
import { getDocumentos, type DocumentoItem } from '../lib/api'
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
  const [erro, setErro] = useState<string | null>(null)
  const [obra, setObra] = useState('')

  useEffect(() => {
    let vivo = true
    getDocumentos()
      .then((r) => vivo && setDocs(r.documentos))
      .catch(() => vivo && setErro('Não consegui carregar os documentos.'))
    return () => { vivo = false }
  }, [])

  const obras = useMemo(() => [...new Set((docs ?? []).map((d) => d.obra).filter(Boolean) as string[])], [docs])
  const filtrados = useMemo(() => (obra ? (docs ?? []).filter((d) => d.obra === obra) : docs ?? []), [docs, obra])

  return (
    <section className="page">
      <PageHead eyebrow="PRAZOS & DOCUMENTOS" title="Documentos" subtitle="Alvará, ART/RRT, ASO, licenças e outros prazos."
        right={<ObraSelect obras={obras} value={obra} onChange={setObra} />} />
      <PageState loading={docs === null} error={erro} empty={!!docs && filtrados.length === 0}
        emptyMsg={obra ? 'Nenhum documento para esta obra.' : "Nenhum documento ainda. Diga à Rosana os prazos da obra (ex.: 'alvará vence dia 30/10') que ela guarda e lembra você."}>
        <section className="card rdo-card">
          <div className="table-scroll">
            <table>
              <thead><tr><th>TIPO</th><th>DESCRIÇÃO</th><th>OBRA</th><th>VENCIMENTO</th><th>SITUAÇÃO</th></tr></thead>
              <tbody>
                {filtrados.map((d) => {
                  const sv = statusVencimento(d.vencimento)
                  return (
                    <tr key={d.id}>
                      <td><span className="tag">{tipoDocLabel(d.tipo)}</span></td>
                      <td>{d.descricao}{d.numero ? <small> · nº {d.numero}</small> : null}</td>
                      <td>{d.obra ?? '—'}</td>
                      <td>{formatDate(d.vencimento)}</td>
                      <td><span className={`prazo prazo--${sv.cls}`}>{sv.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </PageState>
    </section>
  )
}
