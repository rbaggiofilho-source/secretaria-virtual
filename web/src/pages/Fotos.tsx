import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { PageHead, PageState } from '../components/Page'
import { cardsDeObras, ObraCrumb, ObrasDrill, SEM_OBRA } from '../components/Obras'
import { excluirFoto, getFotos, getObras, type FotoItem, type ObraResumo } from '../lib/api'
import { formatDate } from '../lib/format'

const TIPO_LABEL: Record<string, string> = {
  foto_obra: 'Foto de obra',
  nota_fiscal: 'Nota fiscal',
  outro: 'Outro',
}

export function Fotos() {
  const [fotos, setFotos] = useState<FotoItem[] | null>(null)
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [aberta, setAberta] = useState<FotoItem | null>(null)
  const [excluindo, setExcluindo] = useState<number | null>(null)

  async function apagar(f: FotoItem) {
    if (!window.confirm('Excluir esta foto? O arquivo é removido e não dá pra desfazer.')) return
    setExcluindo(f.id)
    try {
      await excluirFoto(f.id)
      setFotos((atual) => (atual ? atual.filter((x) => x.id !== f.id) : atual))
      setAberta((a) => (a && a.id === f.id ? null : a))
    } catch {
      setErro('Não consegui excluir a foto agora. Tente de novo.')
    } finally {
      setExcluindo(null)
    }
  }

  useEffect(() => {
    let vivo = true
    Promise.all([getFotos(), getObras()])
      .then(([f, o]) => { if (vivo) { setFotos(f.fotos); setObras(o.obras) } })
      .catch(() => vivo && setErro('Não consegui carregar as fotos.'))
    return () => { vivo = false }
  }, [])

  const cards = useMemo(() => cardsDeObras(obras, fotos ?? [], (f) => f.obra), [obras, fotos])
  const filtradas = useMemo(
    () => (fotos ?? []).filter((f) => (sel === SEM_OBRA ? !f.obra : f.obra === sel)),
    [fotos, sel],
  )
  const nomeSel = sel === SEM_OBRA ? 'Sem obra' : sel ?? ''

  return (
    <section className="page">
      <PageHead eyebrow="REGISTRO FOTOGRÁFICO" title="Fotos" subtitle="Fotos de obra e notas fiscais, organizadas por obra." />
      <PageState loading={fotos === null} error={erro} empty={!!fotos && cards.length === 0}
        emptyMsg="Nenhuma foto ainda. Mande fotos da obra ou de notas fiscais pra Rosana no WhatsApp.">
        {sel === null ? (
          <ObrasDrill cards={cards} onPick={setSel} rotulo={(n) => (n === 1 ? '1 foto' : `${n} fotos`)} />
        ) : (
          <>
            <ObraCrumb nome={nomeSel} onBack={() => setSel(null)} />
            {filtradas.length === 0 ? (
              <div className="board-msg">Nenhuma foto para esta obra.</div>
            ) : (
              <div className="foto-grid">
                {filtradas.map((f) => (
                  <figure className="foto-card" key={f.id}>
                    <button
                      type="button"
                      className="foto-thumb"
                      onClick={() => f.url && setAberta(f)}
                      disabled={!f.url}
                      aria-label="Ampliar foto"
                    >
                      {f.url ? <img src={f.url} alt={f.descricao ?? 'Foto'} loading="lazy" /> : <span className="foto-off">imagem indisponível</span>}
                      <span className={`foto-tag foto-tag--${f.tipo}`}>{TIPO_LABEL[f.tipo] ?? f.tipo}</span>
                    </button>
                    <button
                      type="button"
                      className="foto-del"
                      title="Excluir foto"
                      aria-label="Excluir foto"
                      disabled={excluindo === f.id}
                      onClick={() => apagar(f)}
                    >
                      <Trash2 size={14} />
                    </button>
                    <figcaption>
                      <p>{f.descricao ?? 'Sem descrição'}</p>
                      <small>{formatDate(f.data)}</small>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </>
        )}
      </PageState>

      {aberta && aberta.url && (
        <div className="lightbox" onClick={() => setAberta(null)} role="dialog" aria-modal="true">
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={aberta.url} alt={aberta.descricao ?? 'Foto'} />
            <div className="lightbox-bar">
              <span>{aberta.descricao ?? 'Sem descrição'}</span>
              <span className="lightbox-actions">
                <a href={aberta.url} target="_blank" rel="noopener noreferrer" download>Baixar</a>
                <button type="button" className="danger" disabled={excluindo === aberta.id} onClick={() => apagar(aberta)}>Excluir</button>
                <button type="button" onClick={() => setAberta(null)}>Fechar</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
