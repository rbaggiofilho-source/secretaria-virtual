import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound, MessageCircle, ShieldCheck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { login, requestCode, setPassword, setToken, type Usuario } from '../lib/api'

const ERRO_MSG: Record<string, string> = {
  credenciais: 'Número ou senha incorretos. Primeiro acesso ou esqueceu a senha? Crie uma nova pelo código no WhatsApp.',
  limite_diario: 'Muitas tentativas hoje. Tente novamente amanhã ou fale com o suporte.',
  bloqueado: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.',
  nao_autorizado: 'Este número não está autorizado. Fale com o Ricardo para liberar seu acesso.',
  muito_cedo: 'Já enviamos um código há pouco. Aguarde um minuto e tente de novo.',
  envio_falhou: 'Não consegui enviar o código pelo WhatsApp agora. Tente em instantes.',
  numero_invalido: 'Número inválido. Digite com DDD, ex.: (48) 98808-8057.',
  invalido: 'Código incorreto ou expirado. Confira ou peça um novo código.',
  expirado: 'O código expirou. Peça um novo.',
  excedeu: 'Muitas tentativas. Peça um novo código.',
  sem_codigo: 'Nenhum código ativo. Peça um novo.',
  senha_fraca: 'A senha precisa ter pelo menos 8 caracteres.',
  faltam_dados: 'Preencha todos os campos.',
  erro_interno: 'Tivemos um problema aqui. Tente novamente.',
}

type Modo = 'login' | 'reset_numero' | 'reset_codigo'

export function Login({ onLogin }: { onLogin: (u: Usuario) => void }) {
  const [modo, setModo] = useState<Modo>('login')
  const [whatsapp, setWhatsapp] = useState('')
  const [senha, setSenha] = useState('')
  const [code, setCode] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [nome, setNome] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [semSenha, setSemSenha] = useState(false)

  const msg = (e: unknown) => ERRO_MSG[String((e as Error)?.message)] ?? 'Algo deu errado. Tente de novo.'

  function irParaReset() {
    setModo('reset_numero')
    setErro(null)
    setSemSenha(false)
    setCode('')
    setNovaSenha('')
    setConfirma('')
  }

  async function entrar(e?: FormEvent) {
    e?.preventDefault()
    setErro(null)
    setSemSenha(false)
    setLoading(true)
    try {
      const r = await login(whatsapp, senha)
      setToken(r.token)
      onLogin(r.usuario)
    } catch (err) {
      // "credenciais" cobre também quem ainda não criou senha (o servidor não
      // revela a diferença): oferece o caminho de criar/redefinir.
      if (String((err as Error)?.message) === 'credenciais') setSemSenha(true)
      setErro(msg(err))
    } finally {
      setLoading(false)
    }
  }

  async function enviarCodigo(e?: FormEvent) {
    e?.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      await requestCode(whatsapp)
      setNome(null)
      setModo('reset_codigo')
    } catch (err) {
      setErro(msg(err))
    } finally {
      setLoading(false)
    }
  }

  async function salvarSenha(e?: FormEvent) {
    e?.preventDefault()
    setErro(null)
    if (novaSenha.length < 8) return setErro(ERRO_MSG.senha_fraca)
    if (novaSenha !== confirma) return setErro('As senhas não coincidem.')
    setLoading(true)
    try {
      const r = await setPassword(whatsapp, code, novaSenha)
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

        {modo === 'login' && (
          <form onSubmit={entrar}>
            <h1>Entrar no painel</h1>
            <p className="login-sub">Acesse com o número de WhatsApp e a sua senha.</p>
            <label className="login-field">
              <span>WhatsApp</span>
              <input type="tel" inputMode="tel" autoFocus placeholder="(48) 98808-8057"
                value={whatsapp} onChange={(ev) => setWhatsapp(ev.target.value)} autoComplete="username" />
            </label>
            <label className="login-field">
              <span>Senha</span>
              <input type="password" placeholder="Sua senha"
                value={senha} onChange={(ev) => setSenha(ev.target.value)} autoComplete="current-password" />
            </label>
            {erro && <p className="login-erro">{erro}{semSenha && <> <button type="button" className="login-link login-link--inline" onClick={irParaReset}>Criar senha agora →</button></>}</p>}
            <button className="login-btn" disabled={loading || !whatsapp.replace(/\D/g, '') || !senha}>
              {loading ? 'Entrando…' : <>Entrar <ArrowRight size={18} /></>}
            </button>
            <div className="login-actions">
              <button type="button" className="login-link" onClick={irParaReset}><KeyRound size={14} /> Esqueci minha senha</button>
              <button type="button" className="login-link" onClick={irParaReset}>Primeiro acesso? Criar senha</button>
            </div>
          </form>
        )}

        {modo === 'reset_numero' && (
          <form onSubmit={enviarCodigo}>
            <h1>Criar / redefinir senha</h1>
            <p className="login-sub">Digite seu número. Vamos enviar um código pelo WhatsApp para confirmar que é você.</p>
            <label className="login-field">
              <span>WhatsApp</span>
              <input type="tel" inputMode="tel" autoFocus placeholder="(48) 98808-8057"
                value={whatsapp} onChange={(ev) => setWhatsapp(ev.target.value)} />
            </label>
            {erro && <p className="login-erro">{erro}</p>}
            <button className="login-btn" disabled={loading || !whatsapp.replace(/\D/g, '')}>
              {loading ? 'Enviando…' : <>Enviar código <ArrowRight size={18} /></>}
            </button>
            <div className="login-actions">
              <button type="button" className="login-link" onClick={() => { setModo('login'); setErro(null) }}>← Voltar ao login</button>
            </div>
          </form>
        )}

        {modo === 'reset_codigo' && (
          <form onSubmit={salvarSenha}>
            <h1>Defina sua senha</h1>
            <p className="login-sub">{nome ? <>Oi, {nome}! </> : null}Se este número estiver cadastrado, enviamos um código no WhatsApp <strong>{whatsapp}</strong>. Digite-o e escolha sua nova senha. Se não chegar em 1 minuto, mande um “oi” para a Rosana no WhatsApp e peça o código de novo.</p>
            <label className="login-field">
              <span>Código do WhatsApp</span>
              <input type="text" inputMode="numeric" autoFocus maxLength={6} className="login-code" placeholder="000000"
                value={code} onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            <label className="login-field">
              <span>Nova senha (mín. 8 caracteres)</span>
              <input type="password" placeholder="Crie uma senha"
                value={novaSenha} onChange={(ev) => setNovaSenha(ev.target.value)} autoComplete="new-password" />
            </label>
            <label className="login-field">
              <span>Confirmar senha</span>
              <input type="password" placeholder="Repita a senha"
                value={confirma} onChange={(ev) => setConfirma(ev.target.value)} autoComplete="new-password" />
            </label>
            {erro && <p className="login-erro">{erro}</p>}
            <button className="login-btn" disabled={loading || code.length < 6 || !novaSenha}>
              {loading ? 'Salvando…' : <>Salvar e entrar <ArrowRight size={18} /></>}
            </button>
            <div className="login-actions">
              <button type="button" className="login-link" onClick={() => { setModo('reset_numero'); setCode(''); setErro(null) }}>← Trocar número</button>
              <button type="button" className="login-link" onClick={() => enviarCodigo()} disabled={loading}><MessageCircle size={14} /> Reenviar código</button>
            </div>
          </form>
        )}

        <p className="login-note"><ShieldCheck size={15} /> A senha só é criada/redefinida com o código enviado ao seu WhatsApp.</p>
      </div>
      <p className="login-footer">Rosana • Secretária virtual para obras</p>
    </div>
  )
}
