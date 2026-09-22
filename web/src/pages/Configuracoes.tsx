import { CalendarDays, KeyRound, LogOut, Trash2, UserRound } from 'lucide-react'
import { PageHead } from '../components/Page'
import { usePanel } from '../components/PanelLayout'

export function Configuracoes() {
  const { usuario, onLogout } = usePanel()
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

        <article className="config-card">
          <div className="config-icon"><KeyRound size={20} /></div>
          <h3>Senha</h3>
          <p>Para trocar sua senha, saia e use <b>“Esqueci minha senha”</b> na tela de login — você recebe um código no WhatsApp e define a nova senha.</p>
          <button className="config-btn" onClick={onLogout}>Sair para trocar a senha</button>
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
