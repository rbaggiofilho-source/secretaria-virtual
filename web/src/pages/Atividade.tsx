import { useEffect, useState } from 'react'
import { AlarmClock, BellRing, CalendarCheck, CheckCircle2, Sunrise, XCircle } from 'lucide-react'
import { PageHead, PageState } from '../components/Page'
import { getAtividade, type AcaoEntregue, type AcaoProgramada } from '../lib/api'

/** "2026-10-05T14:30:00-03:00" → "hoje 14:30" / "05 out. 14:30". */
function quandoBr(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const hoje = new Date()
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const amanha = new Date(hoje.getTime() + 86400000)
  if (mesmoDia(d, hoje)) return `hoje ${hora}`
  if (mesmoDia(d, amanha)) return `amanhã ${hora}`
  const meses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']
  return `${String(d.getDate()).padStart(2, '0')} ${meses[d.getMonth()]} ${hora}`
}

function IconeTipo({ tipo }: { tipo: string }) {
  if (tipo === 'resumo') return <Sunrise size={17} />
  return <BellRing size={17} />
}

export function Atividade() {
  const [prog, setProg] = useState<AcaoProgramada[] | null>(null)
  const [feitas, setFeitas] = useState<AcaoEntregue[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getAtividade()
      .then((r) => { if (vivo) { setProg(r.programados); setFeitas(r.entregues) } })
      .catch(() => vivo && setErro('Não consegui carregar a atividade.'))
    return () => { vivo = false }
  }, [])

  const carregando = prog === null || feitas === null

  return (
    <section className="page">
      <PageHead
        eyebrow="ATIVIDADE"
        title="O que a Rosana fez por você"
        subtitle="Lembretes e resumos que a Rosana programou e já enviou no seu WhatsApp."
      />
      <PageState
        loading={carregando}
        error={erro}
        empty={!carregando && (prog?.length ?? 0) === 0 && (feitas?.length ?? 0) === 0}
        emptyMsg="Ainda não há atividade. Peça um lembrete à Rosana no WhatsApp (ex.: “me lembra amanhã às 9h de ligar pro cliente”) que ele aparece aqui."
      >
        <div className="ativ-cols">
          <section className="card ativ-col">
            <header className="ativ-head"><AlarmClock size={18} /><h3>Programados</h3><span className="ativ-count">{prog?.length ?? 0}</span></header>
            {(prog?.length ?? 0) === 0 ? (
              <p className="ativ-vazio">Nenhum lembrete agendado para frente.</p>
            ) : (
              <ul className="ativ-lista">
                {prog!.map((p) => (
                  <li key={p.id} className="ativ-item">
                    <span className="ativ-ico ativ-ico--prog"><CalendarCheck size={17} /></span>
                    <div className="ativ-txt">
                      <strong>{p.titulo}</strong>
                      {p.local && <small>{p.local}</small>}
                    </div>
                    <span className="ativ-quando">{quandoBr(p.quando)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card ativ-col">
            <header className="ativ-head"><CheckCircle2 size={18} /><h3>Entregues</h3><span className="ativ-count">{feitas?.length ?? 0}</span></header>
            {(feitas?.length ?? 0) === 0 ? (
              <p className="ativ-vazio">Nada enviado ainda.</p>
            ) : (
              <ul className="ativ-lista">
                {feitas!.map((a) => (
                  <li key={a.id} className="ativ-item">
                    <span className={`ativ-ico ativ-ico--${a.status === 'falha' ? 'falha' : 'ok'}`}>
                      {a.status === 'falha' ? <XCircle size={17} /> : <IconeTipo tipo={a.tipo} />}
                    </span>
                    <div className="ativ-txt">
                      <strong>{a.titulo}</strong>
                      {a.detalhe && <small>{a.detalhe}</small>}
                    </div>
                    <span className="ativ-quando">{quandoBr(a.quando)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PageState>
    </section>
  )
}
