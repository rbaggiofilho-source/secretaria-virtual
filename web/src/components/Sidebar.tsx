import { BarChart3, BookOpenText, Building2, CalendarDays, ChevronLeft, FileClock, Images, LayoutDashboard, LogOut, PackageSearch, Settings } from 'lucide-react'
import { Logo } from './Logo'
import type { Usuario } from '../lib/api'

const items = [
  { label: 'Visão geral', icon: LayoutDashboard, active: true },
  { label: 'Obras', icon: Building2 },
  { label: 'Custos', icon: BarChart3 },
  { label: 'Diário de obra', icon: BookOpenText },
  { label: 'Fotos', icon: Images },
  { label: 'Documentos', icon: FileClock },
  { label: 'Materiais', icon: PackageSearch },
]

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase() || 'R'
}

export function Sidebar({
  open,
  onClose,
  usuario,
  onLogout,
  docs = 0,
}: {
  open: boolean
  onClose: () => void
  usuario: Usuario
  onLogout: () => void
  docs?: number
}) {
  const subtitulo = usuario.contextos || usuario.profissao || (usuario.dono ? 'Conta do dono' : 'Beta')
  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-brand"><Logo /><button className="close-menu" onClick={onClose} aria-label="Fechar menu"><ChevronLeft /></button></div>
        <p className="nav-section">GESTÃO</p>
        <nav aria-label="Navegação principal">
          {items.map(({ label, icon: Icon, active }) => (
            <button key={label} className={`nav-item ${active ? 'active' : ''}`}><Icon size={19} /><span>{label}</span>{label === 'Documentos' && docs > 0 && <b>{docs}</b>}</button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="calendar-state"><span><CalendarDays size={18} /></span><div><strong>Google Agenda</strong><small><i /> Conectada</small></div></div>
          <button className="nav-item"><Settings size={19} /><span>Configurações</span></button>
          <button className="nav-item" onClick={onLogout}><LogOut size={19} /><span>Sair</span></button>
          <div className="profile"><div className="avatar">{iniciais(usuario.nome)}</div><div><strong>{usuario.nome}</strong><small>{subtitulo}</small></div></div>
        </div>
      </aside>
    </>
  )
}
