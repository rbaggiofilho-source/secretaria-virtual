import { useEffect, useMemo, useState } from 'react'
import { Cloud, CloudRain, CloudSun, Download, Sun, Users } from 'lucide-react'
import { ObraSelect, PageHead, PageState } from '../components/Page'
import { baixarRdoPdf, getRdos, type RdoItem } from '../lib/api'
import { formatDate } from '../lib/format'

function Clima({ clima }: { clima: string | null }) {
  const c = (clima ?? '').toLowerCase()
  const Icon = c.includes('chuv') ? CloudRain : c.includes('nubl') || c.includes('encob') ? Cloud : c.includes('parc') ? CloudSun : c.includes('sol') || c.includes('limp') ? Sun : CloudSun
  return <span className="rdo-clima"><Icon size={16} /> {clima ?? '—'}</span>
}

export function Diario() {
  const [rdos, setRdos] = useState<RdoItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [obra, setObra] = useState('')
  const [baixando, setBaixando] = useState(false)
  const [avisoPdf, setAvisoPdf] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getRdos()
      .then((r) => vivo && setRdos(r.rdos))
      .catch(() => vivo && setErro('Não consegui carregar os diários de obra.'))
    return () => { vivo = false }
  }, [])

  const obras = useMemo(() => [...new Set((rdos ?? []).map((r) => r.obra).filter(Boolean))], [rdos])
  const filtrados = useMemo(() => (obra ? (rdos ?? []).filter((r) => r.obra === obra) : rdos ?? []), [rdos, obra])

  async function baixar() {
    if (!obra) return
    setBaixando(true)
    setAvisoPdf(null)
    try {
      await baixarRdoPdf(obra)
    } catch {
      setAvisoPdf('Não consegui gerar o PDF agora.')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <section className="page">
      <PageHead eyebrow="ACOMPANHAMENTO DIÁRIO" title="Diário de obra (RDO)" subtitle="Cada dia registrado por voz vira um diário aqui."
        right={
          <>
            <ObraSelect obras={obras} value={obra} onChange={setObra} />
            <button className="btn-primary" onClick={baixar} disabled={!obra || baixando} title={obra ? '' : 'Selecione uma obra para baixar o PDF'}>
              <Download size={16} /> {baixando ? 'Gerando…' : 'Baixar PDF'}
            </button>
          </>
        } />
      {avisoPdf && <div className="board-note">{avisoPdf}</div>}
      <PageState loading={rdos === null} error={erro} empty={!!rdos && filtrados.length === 0}
        emptyMsg={obra ? 'Nenhum RDO para esta obra.' : 'Nenhum RDO ainda. Mande um áudio pra Rosana descrevendo o dia da obra que ela registra aqui.'}>
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
      </PageState>
    </section>
  )
}
