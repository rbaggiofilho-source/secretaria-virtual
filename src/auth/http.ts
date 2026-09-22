/**
 * Utilitários HTTP para os endpoints da plataforma web (/api/app/*).
 *
 * A tela roda num domínio diferente do backend, então precisamos de CORS. A
 * sessão viaja no header Authorization: Bearer (não em cookie), então não há
 * CSRF por cookie; ainda assim, só as origens do painel são liberadas.
 * WEB_APP_ORIGIN (lista separada por vírgula) sobrescreve o padrão abaixo.
 */

const ORIGENS_PADRAO = [
  "https://userosana.com.br",
  "https://www.userosana.com.br",
  "http://localhost:5173",
];
/** Previews do projeto rosana-web na Vercel. */
const PREVIEW_VERCEL = /^https:\/\/rosana-web(-[a-z0-9-]+)?\.vercel\.app$/;

function allowOrigin(request: Request): string {
  const configured = (process.env.WEB_APP_ORIGIN ?? "").trim();
  const list = configured
    ? configured.split(",").map((s) => s.trim()).filter(Boolean)
    : ORIGENS_PADRAO;
  const origin = request.headers.get("origin") ?? "";
  if (list.includes("*")) return "*";
  if (list.includes(origin) || PREVIEW_VERCEL.test(origin)) return origin;
  return list[0] ?? "null";
}

export function corsHeaders(request: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowOrigin(request),
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Responde a um preflight OPTIONS. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** Resposta JSON já com os headers de CORS. */
export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request) },
  });
}

/** Lê o corpo JSON com segurança (retorna {} se vazio/ inválido). */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
