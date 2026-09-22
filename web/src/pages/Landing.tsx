import '../styles/landing.css'

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

function Logo() {
  return <div className="logo" aria-label="Rosana"><span className="logo-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>rosana<i>.</i></span></div>
}

export function Landing() {
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
          <div className="pricing-grid">
            {/* TODO: preço a confirmar */}
            <article className="price-card"><div><span className="plan-name">ESSENCIAL</span><h3>Para organizar a rotina</h3><p>Comece a tirar informações do papel e centralizar a sua obra.</p></div><div className="price"><small>R$</small><strong>89</strong><span>,90<br /><em>/ mês</em></span></div><ul><li>✓ Agenda e lembretes</li><li>✓ Custos por obra</li><li>✓ Registro fotográfico</li><li>✓ Painel web completo</li></ul><a className="sales-button sales-button--outline-dark" href="/cadastro?plano=essencial">Assinar Essencial</a><small className="price-disclaimer">Valor provisório para validação comercial.</small></article>
            {/* TODO: preço a confirmar */}
            <article className="price-card price-card--highlight"><span className="popular-label">MAIS COMPLETO</span><div><span className="plan-name">PROFISSIONAL</span><h3>Sua operação organizada</h3><p>Recursos inteligentes para acompanhar mais obras com produtividade.</p></div><div className="price"><small>R$</small><strong>169</strong><span>,90<br /><em>/ mês</em></span></div><ul><li>✓ Tudo do plano Essencial</li><li>✓ RDO por voz e PDF</li><li>✓ Nota fiscal por foto</li><li>✓ Compras e cotações</li><li>✓ Histórico de preços e orçamentos</li></ul><a className="sales-button sales-button--accent" href="/cadastro?plano=profissional">Assinar Profissional</a><small className="price-disclaimer">Valor provisório para validação comercial.</small></article>
          </div>
        </section>

        <section className="final-cta"><span className="cta-detail" aria-hidden="true"></span><div><p className="sales-kicker sales-kicker--light">SUA OBRA PEDE A SUA ATENÇÃO</p><h2>Deixe a organização<br />com a <em>Rosana.</em></h2><p>Comece agora e descubra uma rotina com mais clareza, produtividade e tempo para construir.</p><a className="sales-button sales-button--accent" href="/cadastro">Quero ganhar meu tempo de volta <span>→</span></a></div></section>
      </main>

      <footer className="sales-footer"><div><Logo /><p>Sua secretária de obras no WhatsApp.</p></div><div className="footer-links"><div><strong>Rosana</strong><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#planos">Planos</a></div><div><strong>Legal</strong><a href="/privacidade">Privacidade</a><a href="/termos">Termos de uso</a></div></div><div className="footer-bottom"><span>© 2026 Rosana. Todos os direitos reservados.</span><span>Feito para quem constrói o Brasil.</span></div></footer>
    </div>
  )
}
