import { useEffect, useState } from 'react'
import { BarChart3, BookOpenText, FileClock, Images, PackageSearch } from 'lucide-react'
import { PageHead, PageState } from '../components/Page'
import { getObras, type ObraResumo } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/format'

const CORES = ['#c4763b', '#497a6d', '#888f68', '#b96730', '#527c8b', '#8a6d9c']

export function Obras() {
  const [obras, setObras] = useState<ObraResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getObras()
      .then((r) => vivo && setObras(r.obras))
      .catch(() => vivo && setErro('Não consegui carregar suas obras.'))
    return () => { vivo = false }
  }, [])

  return (
    <section className="page">
      <PageHead eyebrow="PORTFÓLIO" title="Suas obras" subtitle="Tudo o que a Rosana já registrou, agrupado por obra." />
      <PageState loading={obras === null} error={erro} empty={!!obras && obras.length === 0}
        emptyMsg="Nenhuma obra ainda. Fale com a Rosana no WhatsApp: ao registrar um custo, RDO ou foto, a obra aparece aqui.">
        <div className="card-grid">
          {obras?.map((o, i) => {
            const cor = CORES[i % CORES.length]
            return (
              <article className="obra-card" key={o.nome}>
                <div className="obra-top">
                  <span className="obra-mark" style={{ background: `${cor}1e`, color: cor }}>⌂</span>
                  <div><h3>{o.nome}</h3><small>Última atividade: {formatDate(o.ultimaAtividade)}</small></div>
                </div>
                <div className="obra-invest"><small>Investido</small><strong>{formatCurrency(o.gasto)}</strong></div>
                <div className="obra-stats">
                  <span><BarChart3 size={15} /> {o.custos} custos</span>
                  <span><BookOpenText size={15} /> {o.rdos} RDOs</span>
                  <span><PackageSearch size={15} /> {o.materiais} materiais</span>
                  <span><FileClock size={15} /> {o.documentos} docs</span>
                  <span><Images size={15} /> {o.fotos} fotos</span>
                </div>
              </article>
            )
          })}
        </div>
      </PageState>
    </section>
  )
}
