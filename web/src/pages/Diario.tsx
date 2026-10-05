import { useEffect, useMemo, useState } from 'react'
import { Cloud, CloudRain, CloudSun, Download, Sun, Users } from 'lucide-react'
import { PageHead, PageState } from '../components/Page'
import { cardsDeObras, ObraCrumb, ObrasDrill, SEM_OBRA } from '../components/Obras'
import { baixarRdoPdf, getObras, getRdos, type ObraResumo, type RdoItem } from '../lib/api'
import { formatDate } from '../lib/format'

function Clima({ clima }: { clima: string | null }) {
  const c = (clima ?? '').toLowerCase()
  const Icon = c.includes('chuv') ? CloudRain : c.includes('nubl') || c.includes('encob') ? Cloud : c.includes('parc') ? CloudSun : c.includes('sol') || c.includes('limp') ? Sun : CloudSun
  return <span className="rdo-clima"><Icon size={16} /> {clima ?? '—'}</span>
}

export function Diario() {
  const [rdos, setRdos] = useState<RdoItem[] | null>(null)
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [baixando, setBaixando] = useState(false)
  const [avisoPdf, setAvisoPdf] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([getRdos(), getObras()])
      .then(([r, o]) => { if (vivo) { setRdos(r.rdos); setObras(o.obras) } })
      .catch(() => vivo && setErro('Não consegui carregar os diários de obra.'))
    return () => { vivo = false }
  }, [])

  const cards = useMemo(() => cardsDeObras(obras, rdos ?? [], (r) => r.obra), [obras, rdos])
  const filtrados = useMemo(
    () => (rdos ?? []).filter((r) => (sel === SEM_OBRA ? !r.obra : r.obra === sel)),
    [rdos, sel],
  )
  const nomeSel = sel === SEM_OBRA ? 'Sem obra' : sel ?? ''

  async function baixar() {
    if (!sel || sel === SEM_OBRA) return
    setBaixando(true)
    setAvisoPdf(null)
    try {
      await baixarRdoPdf(sel)
    } catch {
      setAvisoPdf('Não consegui gerar o PDF agora.')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <section className="page">
      <PageHead eyebrow="ACOMPANHAMENTO DIÁRIO" title="Diário de obra (RDO)" subtitle="Escolha uma obra para ver os diários e baixar o PDF." />
      {avisoPdf && <div className="board-note">{avisoPdf}</div>}
      <PageState loading={rdos === null} error={erro} empty={!!rdos && cards.length === 0}
        emptyMsg="Nenhum RDO ainda. Mande um áudio pra Rosana descrevendo o dia da obra que ela registra aqui.">
        {sel === null ? (
          <ObrasDrill cards={cards} onPick={setSel} rotulo={(n) => (n === 1 ? '1 diário' : `${n} diários`)} />
        ) : (
          <>
            <ObraCrumb nome={nomeSel} onBack={() => setSel(null)}
              right={sel !== SEM_OBRA && filtrados.length > 0 ? (
                <button className="btn-primary" onClick={baixar} disabled={baixando}>
                  <Download size={16} /> {baixando ? 'Gerando…' : 'Baixar PDF'}
                </button>
              ) : undefined} />
            {filtrados.length === 0 ? (
              <div className="board-msg">Nenhum RDO para esta obra.</div>
            ) : (
              <div className="rdo-list">
                {filtrados.map((r) => {
                  const total = r.efetivo?.reduce((s, e) => s + (Number(e?.qtd) || 0), 0) ?? 0
                  return (
                    <article className="rdo-item" key={r.id}>
                      <div className="rdo-item-head">
                        <div><strong>{r.obra}</strong><small>RDO-{r.id} · {formatDate(r.data)}</small></div>
                        <div className="rdo-item-meta"><Clima clima={r.clima} /><span className="rdo-efetivo"><Users size={15} /> {total} pessoas</span></div>
                      </div>
                      {r.atividades && <p className="rdo-block"><b>Atividades:</b> {r.atividades}</p>}
                      {r.ocorrencias && <p className="rdo-block"><b>Ocorrências:</b> {r.ocorrencias}</p>}
                      {r.materiais && <p className="rdo-block"><b>Materiais:</b> {r.materiais}</p>}
                      {r.efetivo && r.efetivo.length > 0 && (
                        <div className="rdo-efetivo-list">
                          {r.efetivo.map((e, i) => <span key={i}>{e.qtd}× {e.funcao}</span>)}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </PageState>
    </section>
  )
}
