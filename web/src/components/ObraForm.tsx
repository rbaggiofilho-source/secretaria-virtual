import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { salvarObra, type ObraResumo, type ObraStatus } from '../lib/api'

const STATUS: { v: ObraStatus; label: string }[] = [
  { v: 'ativa', label: 'Ativa' },
  { v: 'pausada', label: 'Pausada' },
  { v: 'concluida', label: 'Concluída' },
]

export function ObraForm({ inicial, onClose, onSaved }: { inicial?: ObraResumo | null; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [cliente, setCliente] = useState(inicial?.cliente ?? '')
  const [endereco, setEndereco] = useState(inicial?.endereco ?? '')
  const [contexto, setContexto] = useState(inicial?.contexto ?? '')
  const [inicio, setInicio] = useState(inicial?.dataInicio ?? '')
  const [fim, setFim] = useState(inicial?.dataFimAlvo ?? '')
  const [status, setStatus] = useState<ObraStatus>(inicial?.status ?? 'ativa')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const editando = !!inicial?.id
  const renomeando = editando && inicial?.nome !== nome.trim()

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return setErro('Informe o nome da obra.')
    setErro(null)
    setLoading(true)
    try {
      await salvarObra({
        id: inicial?.id ?? null,
        nome: nome.trim(),
        cliente, endereco, contexto,
        data_inicio: inicio || null,
        data_fim_alvo: fim || null,
        status,
      })
      onSaved()
    } catch {
      setErro('Não consegui salvar agora. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editando ? 'Editar obra' : 'Nova obra'}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <form className="modal-form" onSubmit={salvar}>
          <label><span>Nome da obra *</span><input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Residencial Aurora" /></label>
          {renomeando && <p className="modal-note">Ao renomear, os custos, RDOs, materiais, documentos e fotos vinculados serão atualizados automaticamente.</p>}
          <div className="modal-row">
            <label><span>Cliente</span><input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente / síndico" /></label>
            <label><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value as ObraStatus)}>{STATUS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</select></label>
          </div>
          <label><span>Endereço</span><input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade" /></label>
          <div className="modal-row">
            <label><span>Data de início</span><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
            <label><span>Previsão de término</span><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
          </div>
          <label><span>Contexto / observações</span><textarea rows={4} value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Histórico, particularidades, contatos, etc." /></label>
          {erro && <p className="modal-erro">{erro}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={loading || !nome.trim()}>{loading ? 'Salvando…' : 'Salvar obra'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
