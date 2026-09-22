import { useEffect, useState } from 'react'
import { PageHead, PageState } from '../components/Page'
import { getFotos, type FotoItem } from '../lib/api'
import { formatDate } from '../lib/format'

const TIPO_LABEL: Record<string, string> = {
  foto_obra: 'Foto de obra',
  nota_fiscal: 'Nota fiscal',
  outro: 'Outro',
}

export function Fotos() {
  const [fotos, setFotos] = useState<FotoItem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getFotos()
      .then((r) => vivo && setFotos(r.fotos))
      .catch(() => vivo && setErro('Não consegui carregar as fotos.'))
    return () => { vivo = false }
  }, [])

  return (
    <section className="page">
      <PageHead eyebrow="REGISTRO FOTOGRÁFICO" title="Fotos" subtitle="Fotos de obra e notas fiscais arquivadas pela Rosana." />
      <PageState loading={fotos === null} error={erro} empty={!!fotos && fotos.length === 0}
        emptyMsg="Nenhuma foto ainda. Mande fotos da obra ou de notas fiscais pra Rosana no WhatsApp.">
        <div className="foto-grid">
          {fotos?.map((f) => (
            <figure className="foto-card" key={f.id}>
              <div className="foto-thumb">
                {f.url ? <img src={f.url} alt={f.descricao ?? 'Foto'} loading="lazy" /> : <span className="foto-off">imagem indisponível</span>}
                <span className={`foto-tag foto-tag--${f.tipo}`}>{TIPO_LABEL[f.tipo] ?? f.tipo}</span>
              </div>
              <figcaption>
                <p>{f.descricao ?? 'Sem descrição'}</p>
                <small>{f.obra ? `${f.obra} · ` : ''}{formatDate(f.data)}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      </PageState>
    </section>
  )
}
