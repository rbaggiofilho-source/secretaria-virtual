import { useEffect, useState } from 'react'
import { Cloud, CloudRain, CloudSun, Sun, Users } from 'lucide-react'
import { PageHead, PageState } from '../components/Page'
import { getRdos, type RdoItem } from '../lib/api'
import { formatDate } from '../lib/format'

function Clima({ clima }: { clima: string | null }) {
  const c = (clima ?? '').toLowerCase()
  const Icon = c.includes('chuv') ? CloudRain : c.includes('nubl') || c.includes('encob') ? Cloud : c.includes('parc') ? CloudSun : c.includes('sol') || c.includes('limp') ? Sun : CloudSun
  return <span className="rdo-clima"><Icon size={16} /> {clima ?? '—'}</span>
}

export function Diario() {
  const [rdos, setRdos] = useState<RdoItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getRdos()
      .then((r) => vivo && setRdos(r.rdos))
      .catch(() => vivo && setErro('Não consegui carregar os diários de obra.'))
    return () => { vivo = false }
  }, [])

  return (
    <section className="page">
      <PageHead eyebrow="ACOMPANHAMENTO DIÁRIO" title="Diário de obra (RDO)" subtitle="Cada dia registrado por voz vira um diário aqui." />
      <PageState loading={rdos === null} error={erro} empty={!!rdos && rdos.length === 0}
        emptyMsg="Nenhum RDO ainda. Mande um áudio pra Rosana descrevendo o dia da obra que ela registra aqui.">
        <div className="rdo-list">
          {rdos?.map((r) => {
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
