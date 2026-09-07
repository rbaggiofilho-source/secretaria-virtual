import process from "node:process";
import { registrarCadastro } from "../src/memory/context.js";

/**
 * Site de cadastro do beta (ENGETEC). GET serve o formulário; POST grava o
 * cadastro e mostra o número da Rosana + manual de uso.
 *
 * IMPORTANTE (modo desenvolvimento da Meta): o cadastro autoriza no NOSSO
 * sistema, mas o número ainda precisa ser adicionado à MÃO por você na lista
 * de destinatários da Meta (a pessoa confirma um código). Só depois disso ela
 * consegue conversar com a Rosana. Teto de 5 destinatários no número de teste.
 */

const ROSANA_NUMERO = "+1 (555) 661-2977";
const ROSANA_WA_LINK = "https://wa.me/15556612977";

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method === "GET") return html(formPage());
      if (request.method === "POST") return await handleSubmit(request);
      return new Response("Method Not Allowed", { status: 405 });
    } catch (err) {
      console.error(`[cadastro] erro: ${err instanceof Error ? err.message : String(err)}`);
      return html(mensagemPage("Ops!", "Tivemos um problema ao processar seu cadastro. Tente de novo em instantes."), 500);
    }
  },
};

async function handleSubmit(request: Request): Promise<Response> {
  const body = new URLSearchParams(await request.text());
  const codigo = (body.get("codigo") ?? "").trim();
  const nomeCompleto = (body.get("nome_completo") ?? "").trim();
  const cpf = (body.get("cpf") ?? "").trim();
  const endereco = (body.get("endereco") ?? "").trim();
  const profissao = (body.get("profissao") ?? "").trim();
  const whatsapp = (body.get("whatsapp") ?? "").trim();
  const consent = body.get("consent");

  const codigoEsperado = process.env.BETA_INVITE_CODE || "ENGETEC2026";
  if (codigo !== codigoEsperado) {
    return html(mensagemPage("Código inválido", "O código de convite não confere. Fale com o Ricardo para receber o seu."), 403);
  }
  if (!nomeCompleto || !whatsapp || !consent) {
    return html(mensagemPage("Faltou preencher", "Preencha nome, WhatsApp e aceite o uso dos dados para continuar."), 400);
  }
  const digits = whatsapp.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 13 || !digits.startsWith("55")) {
    return html(mensagemPage("WhatsApp inválido", "Informe o número com DDD, no formato +55 48 99999-9999."), 400);
  }

  await registrarCadastro({ nomeCompleto, cpf, endereco, profissao, whatsappInput: whatsapp });
  console.log("[cadastro] novo cadastro gravado.");
  return html(sucessoPage(nomeCompleto.split(/\s+/)[0] || nomeCompleto));
}

/* ---------- Páginas ---------- */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function html(inner: string, status = 200): Response {
  return new Response(shell(inner), { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function shell(inner: string): string {
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rosana — Cadastro</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
  :root{--bg:#0A0F0D;--panel:#111915;--panel2:#15201B;--ink:#EDF3EF;--ivory:#E9E4D8;--muted:#95A69E;--line:#243430;--green:#0B2C24;--amber:#DFA94E;--amber2:#C4871B;}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  .wrap{max-width:560px;margin:0 auto;padding:clamp(28px,6vw,64px) 22px 80px}
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:36px}
  .badge{width:46px;height:46px;border-radius:13px;background:var(--green);display:grid;place-items:center}
  .badge svg{width:30px;height:30px}
  .brand .nm{font-family:"Fraunces",serif;font-weight:700;font-size:1.5rem}
  .brand .tg{display:block;font-family:"IBM Plex Mono",monospace;font-size:.55rem;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);margin-top:2px}
  h1{font-family:"Fraunces",serif;font-weight:600;font-size:clamp(1.8rem,5vw,2.5rem);line-height:1.08;margin:0 0 10px;color:var(--ivory)}
  p.lead{color:var(--muted);margin:0 0 28px}
  form{display:flex;flex-direction:column;gap:16px}
  label{display:block;font-size:.82rem;font-weight:600;color:var(--ivory);margin-bottom:6px}
  input[type=text],input[type=tel]{width:100%;padding:13px 14px;border:1px solid var(--line);border-radius:11px;background:var(--panel2);color:var(--ink);font-size:1rem;font-family:inherit}
  input:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
  .hint{font-size:.74rem;color:var(--muted);margin-top:5px}
  .consent{display:flex;gap:10px;align-items:flex-start;font-size:.86rem;color:var(--muted)}
  .consent input{margin-top:4px;accent-color:var(--amber)}
  button{margin-top:8px;padding:15px;border:0;border-radius:100px;background:linear-gradient(135deg,var(--amber),var(--amber2));color:#181004;font-weight:700;font-size:1rem;font-family:inherit;cursor:pointer}
  button:hover{filter:brightness(1.05)}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px;margin-top:8px}
  .num{font-family:"Fraunces",serif;font-weight:700;font-size:1.9rem;color:var(--amber);letter-spacing:.01em}
  ol{padding-left:20px;color:var(--muted)}ol li{margin:8px 0}
  a.wa{display:inline-flex;align-items:center;gap:8px;margin-top:16px;padding:13px 22px;border-radius:100px;background:var(--green);color:var(--ivory);font-weight:600;border:1px solid var(--line)}
  .foot{margin-top:40px;font-size:.72rem;color:#5E6F68}
</style></head><body><div class="wrap">
<div class="brand"><span class="badge"><svg viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#0B2C24"/><path d="M34 25V75" stroke="#EDF3EF" stroke-width="8.5" stroke-linecap="round"/><path d="M34 29H58a14 14 0 0 1 0 28H34" fill="none" stroke="#EDF3EF" stroke-width="8.5" stroke-linecap="round"/><path d="M47 57 71 76" stroke="#DFA94E" stroke-width="8.5" stroke-linecap="round"/><circle cx="74" cy="24" r="4" fill="#DFA94E"/></svg></span><span><span class="nm">Rosana</span><span class="tg">Secretária de obra</span></span></div>
${inner}
<p class="foot">Beta ENGETEC · seus dados são usados apenas para operar a ferramenta.</p>
</div></body></html>`;
}

function formPage(): string {
  return `<h1>Ative sua secretária de obra.</h1>
<p class="lead">Preencha o cadastro e receba na hora o número da Rosana para começar a usar no seu WhatsApp.</p>
<form method="post" action="/cadastro">
  <div><label for="codigo">Código de convite</label><input id="codigo" name="codigo" type="text" required placeholder="Código que o Ricardo te passou"></div>
  <div><label for="nome_completo">Nome completo</label><input id="nome_completo" name="nome_completo" type="text" required></div>
  <div><label for="whatsapp">WhatsApp (com DDD)</label><input id="whatsapp" name="whatsapp" type="tel" required placeholder="+55 48 99999-9999"><div class="hint">É o número que você vai usar para falar com a Rosana.</div></div>
  <div><label for="profissao">Profissão</label><input id="profissao" name="profissao" type="text" placeholder="Ex.: Engenheiro civil, mestre de obra"></div>
  <div><label for="cpf">CPF</label><input id="cpf" name="cpf" type="text" placeholder="Somente números"></div>
  <div><label for="endereco">Endereço</label><input id="endereco" name="endereco" type="text"></div>
  <label class="consent"><input type="checkbox" name="consent" value="1" required> Concordo que meus dados sejam usados para operar a Rosana (LGPD).</label>
  <button type="submit">Criar meu acesso →</button>
</form>`;
}

function sucessoPage(primeiroNome: string): string {
  return `<h1>Tudo pronto, ${esc(primeiroNome)}! 🎉</h1>
<p class="lead">Seu acesso foi criado. Agora é só adicionar a Rosana no seu WhatsApp e mandar a primeira mensagem.</p>
<div class="card">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)">Número da Rosana</div>
  <div class="num">${ROSANA_NUMERO}</div>
  <a class="wa" href="${ROSANA_WA_LINK}">Abrir conversa no WhatsApp</a>
</div>
<div class="card">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Como começar</div>
  <ol>
    <li>Salve o número acima nos seus contatos como <b>Rosana</b>.</li>
    <li>Abra uma conversa e mande <b>“Oi”</b>.</li>
    <li>A Rosana vai se apresentar e te ajudar a conectar sua agenda do Google.</li>
    <li>Pronto: fale ou mande foto que ela organiza (diário de obra, custos, notas, lembretes).</li>
  </ol>
  <p class="hint">Liberação do acesso pode levar alguns minutos enquanto confirmamos seu número. Se a Rosana não responder de primeira, aguarde um pouco e tente de novo.</p>
</div>`;
}

function mensagemPage(titulo: string, texto: string): string {
  return `<h1>${esc(titulo)}</h1><p class="lead">${esc(texto)}</p><a class="wa" href="/cadastro">← Voltar ao cadastro</a>`;
}
