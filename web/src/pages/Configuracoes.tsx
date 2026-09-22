import { useState, type FormEvent } from 'react'
import { CalendarDays, KeyRound, LogOut, Trash2, UserRound } from 'lucide-react'
import { PageHead } from '../components/Page'
import { usePanel } from '../components/PanelLayout'
import { trocarSenha } from '../lib/api'

const ERRO_MSG: Record<string, string> = {
  senha_atual_incorreta: 'A senha atual está incorreta.',
  senha_fraca: 'A nova senha precisa ter pelo menos 8 caracteres.',
  bloqueado: 'Muitas tentativas. Aguarde alguns minutos.',
  faltam_dados: 'Preencha todos os campos.',
}

export function Configuracoes() {
  const { usuario, onLogout } = usePanel()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (nova.length < 8) return setMsg({ tipo: 'erro', texto: ERRO_MSG.senha_fraca })
    if (nova !== confirma) return setMsg({ tipo: 'erro', texto: 'As senhas não coincidem.' })
    setLoading(true)
    try {
      await trocarSenha(atual, nova)
      setMsg({ tipo: 'ok', texto: 'Senha alterada com sucesso.' })
      setAtual(''); setNova(''); setConfirma('')
    } catch (err) {
      setMsg({ tipo: 'erro', texto: ERRO_MSG[String((err as Error)?.message)] ?? 'Não consegui trocar a senha.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page">
      <PageHead eyebrow="SUA CONTA" title="Configurações" subtitle="Seus dados e ações da conta." />

      <div className="config-grid">
        <article className="config-card">
          <div className="config-icon"><UserRound size={20} /></div>
          <h3>Perfil</h3>
          <dl>
            <div><dt>Nome</dt><dd>{usuario.nome}</dd></div>
            <div><dt>Tipo de conta</dt><dd>{usuario.dono ? 'Dono' : 'Cliente'}</dd></div>
            {usuario.profissao && <div><dt>Profissão</dt><dd>{usuario.profissao}</dd></div>}
            {usuario.contextos && <div><dt>Contextos</dt><dd>{usuario.contextos}</dd></div>}
          </dl>
        </article>

        <article className="config-card">
          <div className="config-icon"><CalendarDays size={20} /></div>
          <h3>Google Agenda</h3>
          <p>Seus compromissos são criados na sua agenda pessoal. Para conectar ou reconectar, mande <b>“conectar agenda”</b> para a Rosana no WhatsApp.</p>
        </article>

        <article className="config-card config-card--wide">
          <div className="config-icon"><KeyRound size={20} /></div>
          <h3>Trocar senha</h3>
          <form className="config-form" onSubmit={salvar}>
            <label><span>Senha atual</span><input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" /></label>
            <div className="config-form-row">
              <label><span>Nova senha (mín. 8)</span><input type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" /></label>
              <label><span>Confirmar nova senha</span><input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" /></label>
            </div>
            {msg && <p className={`config-msg config-msg--${msg.tipo}`}>{msg.texto}</p>}
            <button className="config-btn" disabled={loading || !atual || !nova}>{loading ? 'Salvando…' : 'Salvar nova senha'}</button>
          </form>
        </article>

        <article className="config-card config-card--danger">
          <div className="config-icon config-icon--danger"><Trash2 size={20} /></div>
          <h3>Excluir meus dados</h3>
          <p>A exclusão de conta (LGPD) é feita pela Rosana no WhatsApp, enviando a frase exata <b>“EXCLUIR MEUS DADOS”</b>. É irreversível.</p>
        </article>
      </div>

      <button className="config-logout" onClick={onLogout}><LogOut size={16} /> Sair da conta</button>
    </section>
  )
}
