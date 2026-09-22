import { NavLink } from 'react-router-dom'
import { BarChart3, BookOpenText, Building2, CalendarDays, ChevronLeft, FileClock, Images, LayoutDashboard, LogOut, PackageSearch, Settings } from 'lucide-react'
import { Logo } from './Logo'
import type { Usuario } from '../lib/api'

const items = [
  { label: 'Visão geral', icon: LayoutDashboard, to: '/painel', end: true },
  { label: 'Obras', icon: Building2, to: '/painel/obras' },
  { label: 'Custos', icon: BarChart3, to: '/painel/custos' },
  { label: 'Diário de obra', icon: BookOpenText, to: '/painel/diario' },
  { label: 'Fotos', icon: Images, to: '/painel/fotos' },
  { label: 'Documentos', icon: FileClock, to: '/painel/documentos' },
  { label: 'Materiais', icon: PackageSearch, to: '/painel/materiais' },
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
}: {
  open: boolean
  onClose: () => void
  usuario: Usuario
  onLogout: () => void
}) {
  const subtitulo = usuario.contextos || usuario.profissao || (usuario.dono ? 'Conta do dono' : 'Beta')
  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-brand"><Logo /><button className="close-menu" onClick={onClose} aria-label="Fechar menu"><ChevronLeft /></button></div>
        <p className="nav-section">GESTÃO</p>
        <nav aria-label="Navegação principal">
          {items.map(({ label, icon: Icon, to, end }) => (
            <NavLink key={label} to={to} end={end} onClick={onClose}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="calendar-state"><span><CalendarDays size={18} /></span><div><strong>Google Agenda</strong><small><i /> Conectada</small></div></div>
          <NavLink to="/painel/config" onClick={onClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings size={19} /><span>Configurações</span>
          </NavLink>
          <button className="nav-item" onClick={onLogout}><LogOut size={19} /><span>Sair</span></button>
          <div className="profile"><div className="avatar">{iniciais(usuario.nome)}</div><div><strong>{usuario.nome}</strong><small>{subtitulo}</small></div></div>
        </div>
      </aside>
    </>
  )
}
