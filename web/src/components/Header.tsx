import { Bell, Menu, Plus, Search } from 'lucide-react'

export function Header({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="topbar">
      <button className="menu-button" aria-label="Abrir menu" onClick={onMenu}><Menu /></button>
      <label className="search"><Search size={19} /><input placeholder="Buscar obra, documento..." aria-label="Buscar" /><kbd>⌘ K</kbd></label>
      <div className="top-actions"><button className="icon-button" aria-label="Notificações"><Bell size={20} /><i /></button><button className="primary-button"><Plus size={18} /> Nova obra</button></div>
    </header>
  )
}
