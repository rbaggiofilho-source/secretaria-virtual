import { useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import type { Usuario } from '../lib/api'

export interface PanelContext {
  usuario: Usuario
  onLogout: () => void
}

/** Acesso ao usuário/logout dentro das páginas do painel (via Outlet context). */
export function usePanel() {
  return useOutletContext<PanelContext>()
}

export function PanelLayout({ usuario, onLogout }: PanelContext) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} usuario={usuario} onLogout={onLogout} />
      <div className="app-body">
        <Header onMenu={() => setMenuOpen(true)} />
        <main>
          <Outlet context={{ usuario, onLogout } satisfies PanelContext} />
        </main>
      </div>
    </div>
  )
}
