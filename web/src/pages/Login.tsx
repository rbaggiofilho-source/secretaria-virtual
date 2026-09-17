import { useState, type FormEvent } from 'react'
import { ArrowRight, MessageCircle, ShieldCheck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { requestCode, verifyCode, setToken, type Usuario } from '../lib/api'

const ERRO_MSG: Record<string, string> = {
  nao_autorizado: 'Este número não está autorizado. Fale com o Ricardo para liberar seu acesso.',
  muito_cedo: 'Já enviamos um código há pouco. Aguarde um minuto e tente de novo.',
  envio_falhou: 'Não consegui enviar o código pelo WhatsApp agora. Tente novamente em instantes.',
  numero_invalido: 'Número inválido. Digite com DDD, ex.: (48) 98808-8057.',
  invalido: 'Código incorreto. Confira e tente de novo.',
  expirado: 'O código expirou. Peça um novo.',
  excedeu: 'Muitas tentativas. Peça um novo código.',
  sem_codigo: 'Nenhum código ativo. Peça um novo.',
  faltam_dados: 'Preencha o código.',
  erro_interno: 'Tivemos um problema aqui. Tente novamente.',
}

export function Login({ onLogin }: { onLogin: (u: Usuario) => void }) {
  const [step, setStep] = useState<'numero' | 'codigo'>('numero')
  const [whatsapp, setWhatsapp] = useState('')
  const [code, setCode] = useState('')
  const [nome, setNome] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const msg = (e: unknown) => ERRO_MSG[String((e as Error)?.message)] ?? 'Algo deu errado. Tente de novo.'

  async function enviarCodigo(e?: FormEvent) {
    e?.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      const r = await requestCode(whatsapp)
      setNome(r.nome ?? null)
      setStep('codigo')
    } catch (err) {
      setErro(msg(err))
    } finally {
      setLoading(false)
    }
  }

  async function entrar(e?: FormEvent) {
    e?.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      const r = await verifyCode(whatsapp, code)
      setToken(r.token)
      onLogin(r.usuario)
    } catch (err) {
      setErro(msg(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand"><Logo /></div>

        {step === 'numero' ? (
          <form onSubmit={enviarCodigo}>
            <h1>Entrar no painel</h1>
            <p className="login-sub">
              Digite o número de WhatsApp que você usa com a Rosana. Vamos te enviar um código de acesso por lá.
            </p>
            <label className="login-field">
              <span>WhatsApp</span>
              <input
                type="tel"
                inputMode="tel"
                autoFocus
                placeholder="(48) 98808-8057"
                value={whatsapp}
                onChange={(ev) => setWhatsapp(ev.target.value)}
              />
            </label>
            {erro && <p className="login-erro">{erro}</p>}
            <button className="login-btn" disabled={loading || !whatsapp.replace(/\D/g, '')}>
              {loading ? 'Enviando…' : <>Enviar código <ArrowRight size={18} /></>}
            </button>
            <p className="login-note"><ShieldCheck size={15} /> Sem senha. O código chega no seu WhatsApp.</p>
          </form>
        ) : (
          <form onSubmit={entrar}>
            <h1>Digite o código</h1>
            <p className="login-sub">
              {nome ? <>Oi, {nome}! </> : null}
              Enviamos um código de 6 dígitos no WhatsApp <strong>{whatsapp}</strong>.
            </p>
            <label className="login-field">
              <span>Código</span>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                className="login-code"
                placeholder="000000"
                value={code}
                onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            {erro && <p className="login-erro">{erro}</p>}
            <button className="login-btn" disabled={loading || code.length < 6}>
              {loading ? 'Entrando…' : <>Entrar <ArrowRight size={18} /></>}
            </button>
            <div className="login-actions">
              <button type="button" className="login-link" onClick={() => { setStep('numero'); setCode(''); setErro(null) }}>
                ← Trocar número
              </button>
              <button type="button" className="login-link" onClick={() => enviarCodigo()} disabled={loading}>
                <MessageCircle size={14} /> Reenviar código
              </button>
            </div>
          </form>
        )}
      </div>
      <p className="login-footer">Rosana • Secretária virtual para obras</p>
    </div>
  )
}
