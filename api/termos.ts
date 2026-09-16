/**
 * Termos de Uso da Rosana (beta). Página pública, exigida antes de cobrar e
 * útil para o Branding do OAuth (campo Termos de Serviço). GET-only, HTML.
 *
 * Rewrite em vercel.json: /termos -> /api/termos.
 */

const ATUALIZADO = "16 de setembro de 2026";
const CONTATO_EMAIL = "rbaggiofilho@gmail.com";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    return new Response(page(), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

function page(): string {
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rosana — Termos de Uso</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
  :root{--bg:#0A0F0D;--panel:#111915;--ink:#EDF3EF;--ivory:#E9E4D8;--muted:#95A69E;--line:#243430;--green:#0B2C24;--amber:#DFA94E;}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
  .wrap{max-width:720px;margin:0 auto;padding:clamp(28px,6vw,64px) 22px 96px}
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:32px}
  .badge{width:46px;height:46px;border-radius:13px;background:var(--green);display:grid;place-items:center}
  .badge svg{width:30px;height:30px}
  .brand .nm{font-family:"Fraunces",serif;font-weight:700;font-size:1.5rem}
  .brand .tg{display:block;font-family:"IBM Plex Mono",monospace;font-size:.55rem;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);margin-top:2px}
  h1{font-family:"Fraunces",serif;font-weight:600;font-size:clamp(1.9rem,5vw,2.6rem);line-height:1.1;margin:0 0 8px;color:var(--ivory)}
  .upd{color:var(--muted);font-size:.82rem;margin:0 0 36px}
  h2{font-family:"Fraunces",serif;font-weight:600;font-size:1.25rem;color:var(--ivory);margin:36px 0 10px}
  p,li{color:#C7D2CC}
  a{color:var(--amber)}
  ul{padding-left:20px}li{margin:6px 0}
  .box{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:20px 0}
  .box strong{color:var(--ivory)}
  code{font-family:"IBM Plex Mono",monospace;background:#0e1613;border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:.9em;color:var(--ivory)}
  .foot{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);font-size:.78rem;color:#5E6F68}
</style></head><body><div class="wrap">
<div class="brand"><span class="badge"><svg viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#0B2C24"/><path d="M34 25V75" stroke="#EDF3EF" stroke-width="8.5" stroke-linecap="round"/><path d="M34 29H58a14 14 0 0 1 0 28H34" fill="none" stroke="#EDF3EF" stroke-width="8.5" stroke-linecap="round"/><path d="M47 57 71 76" stroke="#DFA94E" stroke-width="8.5" stroke-linecap="round"/><circle cx="74" cy="24" r="4" fill="#DFA94E"/></svg></span><span><span class="nm">Rosana</span><span class="tg">Secretária de obra</span></span></div>

<h1>Termos de Uso</h1>
<p class="upd">Última atualização: ${ATUALIZADO}</p>

<p>Estes Termos regem o uso da Rosana, uma assistente virtual (“secretária de obra”) que funciona pelo WhatsApp, voltada a profissionais da construção civil. Ao usar a Rosana, você concorda com estes Termos e com a <a href="/privacidade">Política de Privacidade</a>. Se não concordar, não use o serviço.</p>

<h2>1. O que é o serviço</h2>
<p>A Rosana ajuda a organizar agenda, custos por obra, diário de obra (RDO), documentos e prazos, materiais e compras, além de transcrever áudios e ler imagens que você enviar. As respostas são geradas por inteligência artificial.</p>

<h2>2. Fase beta</h2>
<div class="box"><p>A Rosana está em <strong>fase de testes (beta)</strong> e é fornecida <strong>“como está”</strong>, podendo conter erros, mudar ou ficar indisponível sem aviso. Não garantimos disponibilidade ininterrupta nem ausência de falhas nesta fase.</p></div>

<h2>3. Quem pode usar</h2>
<p>Você deve ser maior de 18 anos e usar a Rosana no contexto profissional a que ela se destina. O acesso é pessoal e intransferível: o número de WhatsApp autorizado é o seu.</p>

<h2>4. Uso aceitável</h2>
<ul>
  <li>Não use a Rosana para atividades ilícitas, fraude ou violação de direitos de terceiros.</li>
  <li>Não envie conteúdo ilegal, ofensivo ou dados de terceiros sem autorização.</li>
  <li>Não tente sobrecarregar, burlar limites ou fazer engenharia reversa do serviço.</li>
</ul>

<h2>5. Natureza de auxílio (importante para engenharia)</h2>
<div class="box"><p>Os cálculos, estimativas e organizações da Rosana são um <strong>auxílio</strong> e <strong>não substituem</strong> projeto, memorial, laudo ou a responsabilidade técnica do profissional (ART/RRT). Decisões de obra, estruturais ou de segurança são de sua responsabilidade — sempre confira e valide antes de executar. A Rosana também não presta aconselhamento jurídico, contábil ou financeiro.</p></div>

<h2>6. Seus dados</h2>
<p>O tratamento dos seus dados é descrito na <a href="/privacidade">Política de Privacidade</a>, incluindo quais dados coletamos, como usamos e seus direitos sob a LGPD.</p>

<h2>7. Cancelamento e exclusão dos dados</h2>
<p>Você pode parar de usar a qualquer momento. Para <strong>excluir sua conta e apagar seus dados</strong>, basta pedir à própria Rosana no WhatsApp (mande <code>excluir meus dados</code> e confirme quando ela pedir) ou escrever para <a href="mailto:${CONTATO_EMAIL}">${CONTATO_EMAIL}</a>. A exclusão é <strong>irreversível</strong>: apagamos suas memórias, obras, custos, RDOs, documentos, materiais, fotos e a autorização de acesso, salvo o que a lei exigir reter.</p>

<h2>8. Limitação de responsabilidade</h2>
<p>Na medida máxima permitida pela lei, a Rosana e seu responsável não respondem por perdas indiretas, lucros cessantes ou danos decorrentes de decisões tomadas com base nas informações da ferramenta, nem por indisponibilidade de serviços de terceiros (WhatsApp, Google, provedores de IA).</p>

<h2>9. Alterações</h2>
<p>Podemos atualizar estes Termos. A data de “última atualização” no topo indica a versão vigente; o uso continuado após mudanças significa concordância.</p>

<h2>10. Contato</h2>
<p>Dúvidas sobre estes Termos: <a href="mailto:${CONTATO_EMAIL}">${CONTATO_EMAIL}</a>.</p>

<p class="foot">Rosana · secretária de obra por WhatsApp · Beta ENGETEC</p>
</div></body></html>`;
}
