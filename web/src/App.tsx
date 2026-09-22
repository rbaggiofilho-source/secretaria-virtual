import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Cadastro } from './pages/Cadastro'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { getSession, getToken, setToken, type Usuario } from './lib/api'
import { Logo } from './components/Logo'

type Estado =
  | { fase: 'checando' }
  | { fase: 'deslogado' }
  | { fase: 'logado'; usuario: Usuario }

function Splash() {
  return (
    <div className="splash">
      <Logo />
      <p>Carregando…</p>
    </div>
  )
}

/** Marca a rota como não-indexável enquanto montada (áreas privadas). */
function useNoindex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])
}

function RotaEntrar({ estado, onLogin }: { estado: Estado; onLogin: (u: Usuario) => void }) {
  const navigate = useNavigate()
  useNoindex()
  if (estado.fase === 'checando') return <Splash />
  if (estado.fase === 'logado') return <Navigate to="/painel" replace />
  return <Login onLogin={(u) => { onLogin(u); navigate('/painel', { replace: true }) }} />
}

function RotaPainel({ estado, onLogout }: { estado: Estado; onLogout: () => void }) {
  const navigate = useNavigate()
  useNoindex()
  if (estado.fase === 'checando') return <Splash />
  if (estado.fase === 'deslogado') return <Navigate to="/entrar" replace />
  return <Dashboard usuario={estado.usuario} onLogout={() => { onLogout(); navigate('/', { replace: true }) }} />
}

export function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'checando' })

  useEffect(() => {
    let vivo = true
    if (!getToken()) {
      setEstado({ fase: 'deslogado' })
      return
    }
    getSession()
      .then((r) => {
        if (vivo) setEstado({ fase: 'logado', usuario: r.usuario })
      })
      .catch(() => {
        setToken(null)
        if (vivo) setEstado({ fase: 'deslogado' })
      })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route
          path="/entrar"
          element={<RotaEntrar estado={estado} onLogin={(u) => setEstado({ fase: 'logado', usuario: u })} />}
        />
        <Route
          path="/painel"
          element={<RotaPainel estado={estado} onLogout={() => { setToken(null); setEstado({ fase: 'deslogado' }) }} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
