import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Cadastro } from './pages/Cadastro'
import { Mapa } from './pages/Mapa'
import { Login } from './pages/Login'
import { PanelLayout } from './components/PanelLayout'
import { VisaoGeral } from './pages/VisaoGeral'
import { Obras } from './pages/Obras'
import { Custos } from './pages/Custos'
import { Diario } from './pages/Diario'
import { Fotos } from './pages/Fotos'
import { Documentos } from './pages/Documentos'
import { Materiais } from './pages/Materiais'
import { Configuracoes } from './pages/Configuracoes'
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
  return <PanelLayout usuario={estado.usuario} onLogout={() => { onLogout(); navigate('/', { replace: true }) }} />
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
      .catch((err: Error & { status?: number }) => {
        // Só descarta o token se o servidor recusou a sessão (401). Queda de
        // rede/500 não desloga o usuário: na próxima abertura ele segue logado.
        if (err?.status === 401) setToken(null)
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
        <Route path="/mapa" element={<Mapa />} />
        <Route
          path="/entrar"
          element={<RotaEntrar estado={estado} onLogin={(u) => setEstado({ fase: 'logado', usuario: u })} />}
        />
        <Route
          path="/painel"
          element={<RotaPainel estado={estado} onLogout={() => { setToken(null); setEstado({ fase: 'deslogado' }) }} />}
        >
          <Route index element={<VisaoGeral />} />
          <Route path="obras" element={<Obras />} />
          <Route path="custos" element={<Custos />} />
          <Route path="diario" element={<Diario />} />
          <Route path="fotos" element={<Fotos />} />
          <Route path="documentos" element={<Documentos />} />
          <Route path="materiais" element={<Materiais />} />
          <Route path="config" element={<Configuracoes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
