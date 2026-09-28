import { useEffect, useState } from 'react'
import { getPlanosPublicos, type PlanoPublico } from '../lib/api'
import '../styles/landing.css'

function partesPreco(valor: number) {
  const int = Math.floor(valor)
  const cc = Math.round((valor - int) * 100).toString().padStart(2, '0')
  return { int, cc }
}

const recursos = [
  { icon: '◎', title: 'Agenda que se organiza sozinha', text: 'Crie compromissos e lembretes no Google Agenda pelo WhatsApp, por texto ou áudio.' },
  { icon: '◫', title: 'RDO por voz, PDF pronto', text: 'Conte como foi o dia na obra. A Rosana estrutura o diário e deixa o documento pronto.' },
  { icon: '↗', title: 'Custos sob controle', text: 'Acompanhe cada obra e entenda os gastos por material, mão de obra, equipamento e serviço.' },
  { icon: '▣', title: 'Nota fiscal por foto', text: 'Envie a foto da nota. A IA lê as informações e lança o custo na obra para você.' },
  { icon: '◧', title: 'Memória fotográfica da obra', text: 'Arquive registros do canteiro e reencontre cada imagem quando precisar.' },
  { icon: '◇', title: 'Compras e cotações', text: 'Organize materiais, pedidos, fornecedores e cotações separados por obra.' },
  { icon: '◷', title: 'Prazos sem esquecimento', text: 'Receba lembretes de alvará, ART/RRT, ASO e outros documentos importantes.' },
  { icon: '≈', title: 'Seus preços, seus orçamentos', text: 'A Rosana aprende os seus preços reais e usa esse histórico para apoiar novos orçamentos.' },
  { icon: '▥', title: 'Tudo visível no painel', text: 'Consulte obras, custos, RDOs e prazos em uma visão clara também pela web.' },
]

const passos = [
  { number: '01', title: 'Você fala no WhatsApp', text: 'Mande texto, áudio ou foto enquanto está na obra. Sem abrir planilha ou aplicativo complicado.' },
  { number: '02', title: 'A Rosana organiza', text: 'A IA entende o pedido, registra cada informação e mantém tudo no lugar certo.' },
  { number: '03', title: 'Você acompanha', text: 'Veja o panorama das suas obras no painel e volte sua atenção para o que realmente importa.' },
]

// Cartões dos planos. Preço e limites vêm do backend (editáveis no /admin);
// os valores aqui são só o fallback se a API não responder.
interface Cartao {
  id: 'agenda' | 'obra' | 'construtora'
  rotulo: string
  titulo: string
  texto: string
  itens: string[]
  valorPadrao: number
  limitesPadrao: { mensagens: number; fotos: number; audioMin: number; obras: number | null }
  destaque?: boolean
}

const cartoes: Cartao[] = [
  {
    id: 'agenda', rotulo: 'AGENDA', titulo: 'Para organizar a rotina',
    texto: 'Sua agenda e suas pendências no WhatsApp, por texto ou áudio.',
    itens: ['Agenda e lembretes no Google Agenda', 'Memória e pendências', '"Bom dia" com o seu dia', 'Custos de 1 obra', 'Áudio transcrito'],
    valorPadrao: 49, limitesPadrao: { mensagens: 250, fotos: 0, audioMin: 30, obras: 1 },
  },
  {
    id: 'obra', rotulo: 'OBRA', titulo: 'Sua obra no controle',
    texto: 'Para quem toca algumas obras e precisa de registro técnico.',
    itens: ['Tudo do plano Agenda', 'Diário de Obra (RDO) por voz + PDF', 'Nota fiscal por foto (lança o custo)', 'Prazos de alvará, ART/RRT e ASO', 'Orçamento com preços de mercado', 'Painel web completo'],
    valorPadrao: 89, limitesPadrao: { mensagens: 400, fotos: 50, audioMin: 180, obras: 5 }, destaque: true,
  },
  {
    id: 'construtora', rotulo: 'CONSTRUTORA', titulo: 'Operação completa',
    texto: 'Para escritórios e construtoras com várias frentes.',
    itens: ['Tudo do plano Obra', 'Obras ilimitadas', 'Compras, cotações e fornecedores', 'Orçamento com os SEUS preços reais', 'Mais fotos, áudio e mensagens'],
    valorPadrao: 159, limitesPadrao: { mensagens: 700, fotos: 300, audioMin: 600, obras: null },
  },
]

function limitesTexto(p: PlanoPublico | undefined, c: Cartao): string[] {
  const l = {
    mensagens: p?.limite_mensagens ?? c.limitesPadrao.mensagens,
    fotos: p?.limite_fotos ?? c.limitesPadrao.fotos,
    audioMin: p?.limite_audio_min ?? c.limitesPadrao.audioMin,
    obras: p ? p.limite_obras ?? null : c.limitesPadrao.obras,
  }
  const horas = l.audioMin >= 60 ? `${Math.round(l.audioMin / 60)}h de áudio` : `${l.audioMin} min de áudio`
  return [
    `${l.mensagens} mensagens/mês`,
    l.fotos > 0 ? `${l.fotos} fotos/notas por mês` : 'Sem fotos/notas fiscais',
    `${horas}/mês`,
    l.obras === null ? 'Obras ilimitadas' : `Até ${l.obras} obra${l.obras > 1 ? 's' : ''}`,
  ]
}

function Logo() {
  return <div className="logo" aria-label="Rosana"><span className="logo-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>rosana<i>.</i></span></div>
}

export function Landing() {
  const [planos, setPlanos] = useState<Record<string, PlanoPublico>>({})
  useEffect(() => {
    getPlanosPublicos()
      .then((r) => {
        const m: Record<string, PlanoPublico> = {}
        r.planos.forEach((p) => { m[p.id] = p })
        setPlanos(m)
      })
      .catch(() => {})
  }, [])
  return (
    <div className="sales-page">
      <header className="sales-header">
        <a href="/" className="brand-link" aria-label="Rosana — início"><Logo /></a>
        <nav aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#recursos">Recursos</a>
          <a href="#planos">Planos</a>
        </nav>
        <a className="sales-button sales-button--small sales-button--outline" href="/entrar">Já sou cliente <span aria-hidden="true">→</span></a>
      </header>

      <main>
        <section className="sales-hero">
          <div className="hero-copy">
            <p className="sales-kicker"><span></span> INTELIGÊNCIA PARA QUEM CONSTRÓI</p>
            <h1>Sua secretária de obras no <em>WhatsApp.</em></h1>
            <p className="hero-lead">Ganhe seu tempo de volta. A Rosana transforma áudios, fotos e mensagens em uma operação organizada — do canteiro ao escritório.</p>
            <div className="hero-actions">
              <a className="sales-button sales-button--primary" href="/cadastro">Assinar agora <span aria-hidden="true">→</span></a>
              <a className="sales-button sales-button--ghost" href="/entrar">Já sou cliente / Entrar</a>
            </div>
            <p className="hero-note"><span>✓</span> Funciona no WhatsApp que você já usa <span>✓</span> Sem instalação</p>
          </div>
          <div className="hero-visual" aria-label="Exemplo de conversa com a Rosana">
            <div className="blueprint-lines" aria-hidden="true"></div>
            <div className="phone-card">
              <div className="phone-top"><span className="mini-avatar"><b>r</b></span><div><strong>Rosana</strong><small>online</small></div><span>•••</span></div>
              <div className="chat-area">
                <div className="chat-date">HOJE</div>
                <div className="message message--user"><span className="audio-play">▶</span><span className="audio-wave">▁▃▆▄▂▇▅▃▆▂</span><small>0:18</small></div>
                <div className="message message--rosana">Pronto! Registrei o RDO da <strong>Obra Aurora</strong> com 12 profissionais e concretagem da laje. O PDF já está disponível. <span>✓✓</span></div>
                <div className="message message--user message--short">Perfeito, obrigada! 🙌</div>
              </div>
            </div>
            <div className="floating-card floating-card--cost"><span>↗</span><div><small>Custo registrado</small><strong>R$ 4.280,00</strong><em>Material · Obra Aurora</em></div></div>
            <div className="floating-card floating-card--rdo"><span>✓</span><div><small>RDO concluído</small><strong>PDF pronto para enviar</strong></div></div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Feito para profissionais da construção">
          <p>FEITA PARA A ROTINA DE</p><span>Engenheiros</span><i></i><span>Mestres de obra</span><i></i><span>Construtoras</span><i></i><span>Arquitetos</span>
        </section>

        <section className="sales-section how-section" id="como-funciona">
          <div className="section-heading section-heading--center"><p className="sales-kicker">SIMPLES DESDE A PRIMEIRA MENSAGEM</p><h2>Do WhatsApp ao controle da obra.<br /><em>Sem complicação.</em></h2><p>Você continua trabalhando como sempre. A Rosana cuida da organização por trás.</p></div>
          <div className="steps-grid">{passos.map((passo, index) => <article className="step-card" key={passo.number}><div className="step-number">{passo.number}</div><div className="step-icon">{index === 0 ? '◖' : index === 1 ? '✦' : '▥'}</div><h3>{passo.title}</h3><p>{passo.text}</p>{index < passos.length - 1 && <span className="step-arrow" aria-hidden="true">→</span>}</article>)}</div>
        </section>

        <section className="sales-section features-section" id="recursos">
          <div className="section-heading"><p className="sales-kicker">UMA SECRETÁRIA QUE ENTENDE DE OBRA</p><h2>Menos tarefas operacionais.<br /><em>Mais obra acontecendo.</em></h2></div>
          <div className="features-grid">{recursos.map((recurso, index) => <article className={`feature-card ${index === 0 ? 'feature-card--featured' : ''}`} key={recurso.title}><span className="feature-icon">{recurso.icon}</span><div><h3>{recurso.title}</h3><p>{recurso.text}</p></div></article>)}</div>
        </section>

        <section className="productivity-section">
          <div className="productivity-copy"><p className="sales-kicker sales-kicker--light">TEMPO É O RECURSO MAIS CARO DA OBRA</p><h2>Menos papelada.<br />Menos planilha.<br /><em>Menos esquecimento.</em></h2><p>Centralize a rotina operacional em uma conversa simples e encontre as informações sem vasculhar grupos, pastas e cadernos.</p><ul><li><span>✓</span> Registre informações ainda no canteiro</li><li><span>✓</span> Reduza retrabalho administrativo</li><li><span>✓</span> Tenha histórico para decidir com segurança</li></ul></div>
          <div className="example-card"><span className="example-label">EXEMPLO ILUSTRATIVO</span><p>Uma rotina com a Rosana pode representar:</p><div className="example-numbers"><div><strong>5h</strong><span>a menos por semana organizando informações</span></div><div><strong>1 só</strong><span>lugar para consultar a rotina das obras</span></div><div><strong>0</strong><span>lembretes importantes perdidos</span></div></div><small>Estimativas meramente ilustrativas. O resultado varia conforme a rotina e o uso de cada cliente.</small></div>
        </section>

        <section className="sales-section testimonials-section">
          <div className="section-heading section-heading--center"><p className="sales-kicker">A VOZ DE QUEM ESTÁ NA OBRA</p><h2>Feita para a rotina real.</h2><p>Espaço preparado para histórias de clientes durante a validação comercial.</p></div>
          <div className="testimonials-grid">{[1, 2, 3].map((item) => <article className="testimonial-card" key={item}><span>DEPOIMENTO ILUSTRATIVO</span><p>“Este espaço receberá um depoimento real, aprovado pelo cliente, sobre como a Rosana ajudou na rotina da obra.”</p><footer><div className="placeholder-avatar">—</div><div><strong>Nome do cliente</strong><small>Cargo · Empresa</small></div></footer></article>)}</div>
        </section>

        <section className="sales-section pricing-section" id="planos">
          <div className="section-heading section-heading--center"><p className="sales-kicker">PLANOS PARA CONSTRUIR COM CONTROLE</p><h2>Seu tempo vale mais.</h2><p>Escolha a estrutura ideal para a sua rotina. Cancele quando quiser.</p></div>
          <div className="pricing-grid pricing-grid--3">
            {cartoes.map((c) => {
              const p = planos[c.id]
              const preco = partesPreco(p?.valor ?? c.valorPadrao)
              const lim = limitesTexto(p, c)
              return (
                <article key={c.id} className={`price-card${c.destaque ? ' price-card--highlight' : ''}`}>
                  {c.destaque && <span className="popular-label">MAIS ESCOLHIDO</span>}
                  <div><span className="plan-name">{c.rotulo}</span><h3>{c.titulo}</h3><p>{c.texto}</p></div>
                  <div className="price"><small>R$</small><strong>{preco.int}</strong><span>,{preco.cc}<br /><em>/ mês</em></span></div>
                  <ul>{c.itens.map((i) => <li key={i}>✓ {i}</li>)}</ul>
                  <ul className="plan-limits">{lim.map((l) => <li key={l}>{l}</li>)}</ul>
                  <a className={`sales-button ${c.destaque ? 'sales-button--accent' : 'sales-button--outline-dark'}`} href={`/cadastro?plano=${c.id}`}>Assinar {c.rotulo.charAt(0) + c.rotulo.slice(1).toLowerCase()}</a>
                </article>
              )
            })}
          </div>
          <p className="pricing-extras">Bateu o limite do mês? Sem precisar trocar de plano: compre um pacote extra direto no WhatsApp — +100 mensagens por R$ 19,90, +50 fotos por R$ 9,90 ou +2h de áudio por R$ 9,90.</p>
        </section>

        <section className="final-cta"><span className="cta-detail" aria-hidden="true"></span><div><p className="sales-kicker sales-kicker--light">SUA OBRA PEDE A SUA ATENÇÃO</p><h2>Deixe a organização<br />com a <em>Rosana.</em></h2><p>Comece agora e descubra uma rotina com mais clareza, produtividade e tempo para construir.</p><a className="sales-button sales-button--accent" href="/cadastro">Quero ganhar meu tempo de volta <span>→</span></a></div></section>
      </main>

      <footer className="sales-footer"><div><Logo /><p>Sua secretária de obras no WhatsApp.</p></div><div className="footer-links"><div><strong>Rosana</strong><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#planos">Planos</a></div><div><strong>Legal</strong><a href="/privacidade">Privacidade</a><a href="/termos">Termos de uso</a></div></div><div className="footer-bottom"><span>© 2026 Rosana. Todos os direitos reservados.</span><span>Feito para quem constrói o Brasil.</span></div></footer>
    </div>
  )
}
