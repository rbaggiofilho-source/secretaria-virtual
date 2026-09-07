/**
 * Páginas HTML curtas (com a cara da Rosana) para o fim do fluxo OAuth.
 * Mesmo sistema visual do site de cadastro: verde profundo + âmbar.
 */

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function shell(inner: string): string {
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rosana — Agenda</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
  :root{--bg:#0A0F0D;--panel:#111915;--panel2:#15201B;--ink:#EDF3EF;--ivory:#E9E4D8;--muted:#95A69E;--line:#243430;--green:#0B2C24;--amber:#DFA94E;}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  .wrap{max-width:520px;margin:0 auto;padding:clamp(40px,10vw,90px) 22px 80px;text-align:center}
  .badge{width:56px;height:56px;border-radius:15px;background:var(--green);display:inline-grid;place-items:center;margin-bottom:28px}
  .badge svg{width:36px;height:36px}
  h1{font-family:"Fraunces",serif;font-weight:600;font-size:clamp(1.7rem,5vw,2.3rem);line-height:1.1;margin:0 0 12px;color:var(--ivory)}
  p{color:var(--muted);margin:0 auto 8px;max-width:40ch}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;margin-top:26px;text-align:left}
  .mono{font-family:"IBM Plex Mono",monospace;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  b{color:var(--ivory)}
  .foot{margin-top:40px;font-size:.72rem;color:#5E6F68}
</style></head><body><div class="wrap">
<span class="badge"><svg viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#0B2C24"/><path d="M34 25V75" stroke="#EDF3EF" stroke-width="8.5" stroke-linecap="round"/><path d="M34 29H58a14 14 0 0 1 0 28H34" fill="none" stroke="#EDF3EF" stroke-width="8.5" stroke-linecap="round"/><path d="M47 57 71 76" stroke="#DFA94E" stroke-width="8.5" stroke-linecap="round"/><circle cx="74" cy="24" r="4" fill="#DFA94E"/></svg></span>
${inner}
<p class="foot">Rosana · secretária de obra por WhatsApp</p>
</div></body></html>`;
}

function page(inner: string, status: number): Response {
  return new Response(shell(inner), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Página de sucesso: agenda conectada. */
export function successPage(email: string | null): Response {
  const quem = email
    ? `<div class="card"><div class="mono">Conta conectada</div><div style="margin-top:6px"><b>${esc(email)}</b></div></div>`
    : "";
  return page(
    `<h1>Agenda conectada! 🎉</h1>
<p>Pronto. Agora a Rosana pode criar e consultar compromissos direto na sua agenda do Google.</p>
${quem}
<p style="margin-top:22px">Pode fechar esta página e voltar para o WhatsApp — é só pedir “marca uma reunião amanhã às 9h” que ela agenda.</p>`,
    200,
  );
}

/** Página de erro amigável. */
export function errorPage(titulo: string, texto: string, status = 400): Response {
  return page(`<h1>${esc(titulo)}</h1><p>${esc(texto)}</p>`, status);
}
