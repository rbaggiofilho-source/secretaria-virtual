import { BarChart3, BookOpenText, Building2, CalendarDays, ChevronLeft, FileClock, Images, LayoutDashboard, PackageSearch, Settings } from 'lucide-react'
import { Logo } from './Logo'

const items = [
  { label: 'Visão geral', icon: LayoutDashboard, active: true },
  { label: 'Obras', icon: Building2 },
  { label: 'Custos', icon: BarChart3 },
  { label: 'Diário de obra', icon: BookOpenText },
  { label: 'Fotos', icon: Images },
  { label: 'Documentos', icon: FileClock },
  { label: 'Materiais', icon: PackageSearch },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-brand"><Logo /><button className="close-menu" onClick={onClose} aria-label="Fechar menu"><ChevronLeft /></button></div>
        <p className="nav-section">GESTÃO</p>
        <nav aria-label="Navegação principal">
          {items.map(({ label, icon: Icon, active }) => (
            <button key={label} className={`nav-item ${active ? 'active' : ''}`}><Icon size={19} /><span>{label}</span>{label === 'Documentos' && <b>3</b>}</button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="calendar-state"><span><CalendarDays size={18} /></span><div><strong>Google Agenda</strong><small><i /> Conectada</small></div></div>
          <button className="nav-item"><Settings size={19} /><span>Configurações</span></button>
          <div className="profile"><div className="avatar">RB</div><div><strong>Ricardo Baggio</strong><small>ENGETEC</small></div><button aria-label="Opções do perfil">•••</button></div>
        </div>
      </aside>
    </>
  )
}
