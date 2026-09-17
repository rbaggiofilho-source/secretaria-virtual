import { useEffect, useState } from 'react'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { getSession, getToken, setToken, type Usuario } from './lib/api'
import { Logo } from './components/Logo'

type Estado =
  | { fase: 'checando' }
  | { fase: 'deslogado' }
  | { fase: 'logado'; usuario: Usuario }

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

  function sair() {
    setToken(null)
    setEstado({ fase: 'deslogado' })
  }

  if (estado.fase === 'checando') {
    return (
      <div className="splash">
        <Logo />
        <p>Carregando…</p>
      </div>
    )
  }

  if (estado.fase === 'deslogado') {
    return <Login onLogin={(usuario) => setEstado({ fase: 'logado', usuario })} />
  }

  return <Dashboard usuario={estado.usuario} onLogout={sair} />
}
