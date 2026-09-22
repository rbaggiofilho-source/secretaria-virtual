import { useSearchParams } from 'react-router-dom'
import { MapPin, Navigation } from 'lucide-react'
import { Logo } from '../components/Logo'

export function Mapa() {
  const [params] = useSearchParams()
  const dest = (params.get('dest') ?? '').trim()
  const nome = (params.get('nome') ?? '').trim()
  const enc = encodeURIComponent(dest)

  const apps = dest
    ? [
        { label: 'Google Maps', cor: '#1a73e8', href: `https://www.google.com/maps/dir/?api=1&destination=${enc}` },
        { label: 'Waze', cor: '#33ccff', href: `https://waze.com/ul?q=${enc}&navigate=yes` },
        { label: 'Apple Maps', cor: '#111', href: `https://maps.apple.com/?daddr=${enc}` },
      ]
    : []

  return (
    <div className="mapa-shell">
      <div className="mapa-card">
        <div className="mapa-brand"><Logo /></div>
        <div className="mapa-icon"><Navigation size={26} /></div>
        {dest ? (
          <>
            <h1>Traçar rota{nome ? <> para <em>{nome}</em></> : ''}</h1>
            <p className="mapa-end"><MapPin size={15} /> {dest}</p>
            <p className="mapa-sub">Escolha por onde quer navegar:</p>
            <div className="mapa-apps">
              {apps.map((a) => (
                <a key={a.label} className="mapa-btn" href={a.href} target="_blank" rel="noopener noreferrer" style={{ borderColor: a.cor }}>
                  <span className="mapa-dot" style={{ background: a.cor }} /> {a.label}
                </a>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1>Endereço não informado</h1>
            <p className="mapa-sub">Este link não tem um destino. Cadastre o endereço da obra no painel e tente de novo.</p>
          </>
        )}
      </div>
      <p className="mapa-footer">Rosana • Secretária virtual para obras</p>
    </div>
  )
}
