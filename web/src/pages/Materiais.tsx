import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { PageHead, PageState } from '../components/Page'
import { cardsDeObras, ObraCrumb, ObrasDrill, SEM_OBRA } from '../components/Obras'
import { getMateriais, getObras, type MaterialItem, type ObraResumo } from '../lib/api'
import {
  formatCurrency,
  formatDate,
  materialStatusLabel,
  materialStatusOrdem,
  categoriaMaterial,
  categoriaMaterialLabel,
  CATEGORIAS_MATERIAL,
} from '../lib/format'

const STATUS = ['cotando', 'a_comprar', 'comprado', 'entregue', 'cancelado']

export function Materiais() {
  const [mats, setMats] = useState<MaterialItem[] | null>(null)
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  // Filtros do mapa de cotações
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [categoria, setCategoria] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  useEffect(() => {
    let vivo = true
    Promise.all([getMateriais(), getObras()])
      .then(([m, o]) => { if (vivo) { setMats(m.materiais); setObras(o.obras) } })
      .catch(() => vivo && setErro('Não consegui carregar os materiais.'))
    return () => { vivo = false }
  }, [])

  const cards = useMemo(() => cardsDeObras(obras, mats ?? [], (m) => m.obra), [obras, mats])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (mats ?? [])
      .filter((m) => (sel === SEM_OBRA ? !m.obra : m.obra === sel))
      .filter((m) => !status || m.status === status)
      .filter((m) => !categoria || categoriaMaterial(m.item) === categoria)
      .filter((m) => !q || m.item.toLowerCase().includes(q) || (m.fornecedor ?? '').toLowerCase().includes(q))
      .filter((m) => {
        if (!de && !ate) return true
        const p = m.previsao_entrega
        if (!p) return false // filtrou por prazo: item sem prazo não entra
        if (de && p < de) return false
        if (ate && p > ate) return false
        return true
      })
      // EM ANDAMENTO (cotando) no topo; a iniciar depois; concluídos por último.
      // Ordenação estável: preserva a ordem por atualização dentro de cada status.
      .map((m, i) => ({ m, i }))
      .sort((a, b) => materialStatusOrdem(a.m.status) - materialStatusOrdem(b.m.status) || a.i - b.i)
      .map((x) => x.m)
  }, [mats, sel, status, categoria, busca, de, ate])

  const nomeSel = sel === SEM_OBRA ? 'Sem obra' : sel ?? ''
  const temFiltro = !!(busca || status || categoria || de || ate)
  const limpar = () => { setBusca(''); setStatus(''); setCategoria(''); setDe(''); setAte('') }

  return (
    <section className="page">
      <PageHead eyebrow="COMPRAS & COTAÇÕES" title="Materiais" subtitle="Escolha uma obra para ver os itens, do 'a comprar' ao 'entregue'." />
      <PageState loading={mats === null} error={erro} empty={!!mats && cards.length === 0}
        emptyMsg="Nenhum material ainda. Diga à Rosana o que precisa comprar e as cotações que for recebendo.">
        {sel === null ? (
          <ObrasDrill cards={cards} onPick={setSel} rotulo={(n) => (n === 1 ? '1 item' : `${n} itens`)} />
        ) : (
          <>
            <ObraCrumb nome={nomeSel} onBack={() => setSel(null)} />

            <div className="mat-filtros">
              <label className="filter-search">
                <Search size={16} />
                <input placeholder="Buscar por item ou fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                {busca && <button type="button" aria-label="Limpar" onClick={() => setBusca('')}><X size={14} /></button>}
              </label>
              <select className="filter-select" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtrar por categoria">
                <option value="">Todas as categorias</option>
                {CATEGORIAS_MATERIAL.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
                <option value="">Todos os status</option>
                {STATUS.map((s) => <option key={s} value={s}>{materialStatusLabel(s)}</option>)}
              </select>
              <label className="mat-periodo">
                <span>Entrega de</span>
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              </label>
              <label className="mat-periodo">
                <span>até</span>
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
              </label>
              {temFiltro && <button type="button" className="btn-ghost mat-limpar" onClick={limpar}>Limpar filtros</button>}
            </div>

            {filtrados.length === 0 ? (
              <div className="board-msg">{temFiltro ? 'Nenhum material com esses filtros.' : 'Nenhum material para esta obra.'}</div>
            ) : (
              <section className="card rdo-card">
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>ITEM</th><th>CATEGORIA</th><th>STATUS</th><th>FORNECEDOR</th><th>ENTREGA</th><th>COTAÇÕES</th><th style={{ textAlign: 'right' }}>VALOR</th></tr></thead>
                    <tbody>
                      {filtrados.map((m) => (
                        <tr key={m.id}>
                          <td><strong>{m.item}</strong>{m.quantidade ? <small> · {m.quantidade}{m.unidade ? ` ${m.unidade}` : ''}</small> : null}</td>
                          <td><span className={`mat-cat mat-cat--${categoriaMaterial(m.item)}`}>{categoriaMaterialLabel(categoriaMaterial(m.item))}</span></td>
                          <td><span className={`mat-status mat-status--${m.status}`}>{materialStatusLabel(m.status)}</span></td>
                          <td>{m.fornecedor ?? '—'}</td>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{m.previsao_entrega ? formatDate(m.previsao_entrega) : '—'}</td>
                          <td>{m.cotacoes?.length ? `${m.cotacoes.length} cotação(ões)` : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{m.valor_total != null ? formatCurrency(m.valor_total) : m.valor_unitario != null ? formatCurrency(m.valor_unitario) : '—'}</td>
                        </tr>
                      ))}
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
