import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Menu, Plus, Search } from 'lucide-react'

export function Header({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate()
  const [termo, setTermo] = useState('')

  function buscar(e: FormEvent) {
    e.preventDefault()
    const q = termo.trim()
    navigate(q ? `/painel/obras?q=${encodeURIComponent(q)}` : '/painel/obras')
  }

  return (
    <header className="topbar">
      <button className="menu-button" aria-label="Abrir menu" onClick={onMenu}><Menu /></button>
      <form className="search" onSubmit={buscar}>
        <Search size={19} />
        <input placeholder="Buscar obra..." aria-label="Buscar" value={termo} onChange={(e) => setTermo(e.target.value)} />
        <kbd>↵</kbd>
      </form>
      <div className="top-actions">
        <button className="icon-button" aria-label="Notificações"><Bell size={20} /><i /></button>
        <button className="primary-button" onClick={() => navigate('/painel/obras?novo=1')}><Plus size={18} /> Nova obra</button>
      </div>
    </header>
  )
}
