import { Building2, ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ObraResumo } from '../lib/api'

/**
 * Navegação "obra primeiro" das sub-abas (Documentos, Fotos, Custos, Diário,
 * Materiais): o usuário vê PRIMEIRO os cartões das obras que ele cadastrou (em
 * Obras) e, ao clicar numa, abre só o conteúdo daquela obra. O cadastro de obras
 * vira, assim, a estrutura de organização de todas as seções.
 */

export const SEM_OBRA = '__sem_obra__'

export interface ObraCard {
  /** Nome da obra; SEM_OBRA para os itens não vinculados a nenhuma obra. */
  chave: string
  nome: string
  cliente: string | null
  status: string | null
  count: number
}

/**
 * Monta os cartões: todas as obras do CADASTRO (mesmo com 0 itens na seção) +
 * obras que aparecem só nos itens (legado, "não organizadas") + um balde
 * "Sem obra" para itens sem vínculo. A contagem reflete o que abrirá ao clicar.
 */
export function cardsDeObras<T>(
  obras: ObraResumo[],
  itens: T[],
  nomeDoItem: (item: T) => string | null,
): ObraCard[] {
  const count = new Map<string, number>()
  for (const it of itens) {
    const nome = (nomeDoItem(it) ?? '').trim()
    const chave = nome || SEM_OBRA
    count.set(chave, (count.get(chave) ?? 0) + 1)
  }

  const cards: ObraCard[] = []
  const vistos = new Set<string>()
  for (const o of obras) {
    const chave = o.nome
    vistos.add(chave)
    cards.push({ chave, nome: o.nome, cliente: o.cliente, status: o.status, count: count.get(chave) ?? 0 })
  }
  // Obras que só existem nos itens (ainda não cadastradas em Obras).
  for (const [chave, n] of count) {
    if (chave === SEM_OBRA || vistos.has(chave)) continue
    cards.push({ chave, nome: chave, cliente: null, status: null, count: n })
  }
  // Balde "Sem obra" por último, só se houver itens soltos.
  const soltos = count.get(SEM_OBRA) ?? 0
  if (soltos > 0) cards.push({ chave: SEM_OBRA, nome: 'Sem obra', cliente: null, status: null, count: soltos })
  // Obras com itens primeiro; depois alfabético.
  return cards.sort((a, b) => (b.count - a.count) || a.nome.localeCompare(b.nome))
}

const STATUS_LABEL: Record<string, string> = {
  ativa: 'Ativa', pausada: 'Pausada', concluida: 'Concluída',
}

/** Grade de cartões de obra. `rotulo(count)` dá o texto do contador da seção. */
export function ObrasDrill({
  cards,
  rotulo,
  onPick,
}: {
  cards: ObraCard[]
  rotulo: (count: number) => string
  onPick: (chave: string) => void
}) {
  return (
    <div className="obra-pick-grid">
      {cards.map((c) => (
        <button key={c.chave} className="obra-pick" onClick={() => onPick(c.chave)}>
          <span className="obra-pick-ico"><Building2 size={18} /></span>
          <span className="obra-pick-body">
            <strong>{c.nome}</strong>
            {c.cliente && <small>{c.cliente}</small>}
          </span>
          <span className="obra-pick-meta">
            {c.status && c.chave !== SEM_OBRA && <span className={`obra-badge obra-badge--${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>}
            <span className="obra-pick-count">{rotulo(c.count)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** Cabeçalho da seção dentro de uma obra, com o "voltar pra todas as obras". */
export function ObraCrumb({ nome, onBack, right }: { nome: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="obra-crumb">
      <button className="obra-crumb-back" onClick={onBack}><ChevronLeft size={16} /> Todas as obras</button>
      <strong className="obra-crumb-nome">{nome}</strong>
      {right && <span className="obra-crumb-right">{right}</span>}
    </div>
  )
}
