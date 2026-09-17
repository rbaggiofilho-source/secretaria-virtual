/**
 * Utilitários HTTP para os endpoints da plataforma web (/api/app/*).
 *
 * A tela roda num domínio diferente do backend, então precisamos de CORS. Como
 * a sessão viaja num header Authorization: Bearer (e NÃO em cookie), não há
 * risco de CSRF por cookie e podemos liberar a origem com segurança. Se quiser
 * travar numa origem específica, defina WEB_APP_ORIGIN na Vercel.
 */

function allowOrigin(request: Request): string {
  const configured = (process.env.WEB_APP_ORIGIN ?? "").trim();
  if (!configured) return "*";
  // Permite uma lista separada por vírgula; ecoa a origem se estiver na lista.
  const origin = request.headers.get("origin") ?? "";
  const list = configured.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : list[0] ?? "*";
}

export function corsHeaders(request: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowOrigin(request),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
