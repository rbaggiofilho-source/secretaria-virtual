/**
 * Política de Privacidade da Rosana (beta). Página pública exigida pelo Google
 * para publicar o app OAuth em produção. GET-only, HTML estático.
 *
 * Rewrite em vercel.json: /privacidade -> /api/privacidade.
 */

const ATUALIZADO = "7 de setembro de 2026";
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
<title>Rosana — Política de Privacidade</title>
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
  .foot{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);font-size:.78rem;color:#5E6F68}
</style></head><body><div class="wrap">
<div class="brand"><span class="badge"><svg viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#0B2C24"/><path d="M34 25V75" stroke="#EDF3EF" stroke-width="8.5" stroke-linecap="round"/><path d="M34 29H58a14 14 0 0 1 0 28H34" fill="none" stroke="#EDF3EF" stroke-width="8.5" stroke-linecap="round"/><path d="M47 57 71 76" stroke="#DFA94E" stroke-width="8.5" stroke-linecap="round"/><circle cx="74" cy="24" r="4" fill="#DFA94E"/></svg></span><span><span class="nm">Rosana</span><span class="tg">Secretária de obra</span></span></div>

<h1>Política de Privacidade</h1>
<p class="upd">Última atualização: ${ATUALIZADO}</p>

<p>A Rosana é uma assistente virtual (“secretária de obra”) que funciona pelo WhatsApp, voltada a profissionais da construção civil. Esta política explica quais dados coletamos, como usamos e como você pode controlá-los. Ao usar a Rosana, você concorda com o descrito aqui.</p>

<h2>1. Quem é o responsável</h2>
<p>O tratamento dos dados é feito pelo responsável pela Rosana (contato abaixo). Nesta fase de teste (beta), a ferramenta é distribuída a um número reduzido de usuários convidados.</p>

<h2>2. Dados que coletamos</h2>
<ul>
  <li><strong>Cadastro:</strong> nome completo, CPF, endereço, profissão e número de WhatsApp — informados por você no cadastro.</li>
  <li><strong>Conteúdo das conversas:</strong> as mensagens que você envia à Rosana (texto, áudio e imagens), e o que a Rosana responde, para executar o que você pede e manter o contexto.</li>
  <li><strong>Dados de obra:</strong> compromissos, custos, diário de obra (RDO), fotos e notas fiscais que você registra.</li>
  <li><strong>Dados do Google (opcional):</strong> se você conectar sua Agenda do Google, guardamos um token de acesso (autorização) para criar e consultar eventos <em>na sua própria agenda</em>.</li>
</ul>

<h2>3. Como usamos os dados</h2>
<ul>
  <li>Operar a assistente: organizar agenda e lembretes, registrar custos, gerar o diário de obra e seu PDF, transcrever áudios e descrever imagens.</li>
  <li>Manter o histórico recente da conversa, para a Rosana entender o contexto.</li>
  <li>Autorizar e distribuir o acesso durante o beta.</li>
</ul>
<p>Não vendemos seus dados e não os usamos para publicidade.</p>

<h2>4. Uso de dados da API do Google</h2>
<div class="box">
<p>O uso e a transferência, pela Rosana, de informações recebidas das APIs do Google seguem a <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Política de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de <strong>Uso Limitado (Limited Use)</strong>.</p>
<p>Na prática: usamos o acesso à sua Agenda do Google <strong>apenas</strong> para criar, atualizar e consultar eventos que você pede pela Rosana. O escopo solicitado é <code>calendar.events</code>. Não lemos outros dados da sua conta Google, não compartilhamos esses dados com terceiros para outros fins, não os usamos para anúncios e nenhum humano lê seus eventos, salvo com sua autorização, para suporte que você pedir, ou por exigência legal.</p>
</div>

<h2>5. Com quem compartilhamos (operadores)</h2>
<p>Para funcionar, a Rosana usa provedores que processam dados em nosso nome, apenas no necessário:</p>
<ul>
  <li><strong>Meta / WhatsApp</strong> — canal das mensagens.</li>
  <li><strong>Anthropic (Claude)</strong> — modelo de IA que interpreta e responde.</li>
  <li><strong>Groq</strong> — transcrição de áudios (voz → texto).</li>
  <li><strong>Google</strong> — Agenda (quando você conecta).</li>
  <li><strong>Supabase</strong> — banco de dados onde ficam seus registros.</li>
  <li><strong>Vercel</strong> — hospedagem do serviço.</li>
</ul>

<h2>6. Segurança</h2>
<p>O acesso ao banco é feito somente pelo servidor, com chave de serviço, e as tabelas têm segurança em nível de linha (RLS) ativada. Os dados de cada usuário são isolados pelo número de WhatsApp. Ainda assim, nenhum sistema é 100% infalível; use a ferramenta com bom senso.</p>

<h2>7. Retenção</h2>
<p>Guardamos seus dados enquanto sua conta estiver ativa no beta. Você pode pedir a exclusão a qualquer momento (abaixo). Ao encerrar, apagamos seus dados, salvo obrigação legal de retenção.</p>

<h2>8. Seus direitos (LGPD)</h2>
<p>Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados, e revogar consentimentos. Para isso, fale pelo contato abaixo.</p>
<p>Para <strong>desconectar a Agenda do Google</strong> a qualquer momento, remova o acesso do app em <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>. Você também pode pedir à Rosana que reconecte outra conta.</p>

<h2>9. Menores</h2>
<p>A Rosana é destinada a profissionais adultos. Não coletamos intencionalmente dados de menores de idade.</p>

<h2>10. Alterações</h2>
<p>Podemos atualizar esta política. A data de “última atualização” no topo indica a versão vigente.</p>

<h2>11. Contato</h2>
<p>Dúvidas ou solicitações sobre privacidade: <a href="mailto:${CONTATO_EMAIL}">${CONTATO_EMAIL}</a>.</p>

<p class="foot">Rosana · secretária de obra por WhatsApp · Beta ENGETEC</p>
</div></body></html>`;
}
