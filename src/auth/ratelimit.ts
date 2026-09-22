import { getSupabase } from "../memory/supabase.js";

/**
 * Limite de tentativas por chave numa janela fixa, guardado no banco
 * (tabela secretaria_rate_limits) — funções serverless não têm memória
 * compartilhada. A atualização é OTIMISTA (update ... where contagem = n): duas
 * requisições simultâneas não conseguem gastar a mesma "vaga", então rajadas
 * paralelas não furam o limite.
 *
 * Em falha de infraestrutura (banco fora), libera (fail-open) e loga: é melhor
 * não travar o login de todo mundo por um problema do banco. As proteções por
 * usuário (bloqueio de senha, tentativas do OTP) continuam valendo.
 */

const MAX_RETRIES = 4;

/**
 * Consome 1 unidade da chave. Retorna true se ainda estava dentro do limite
 * (`max` por `janelaMs`), false se estourou.
 */
export async function consumirLimite(
  chave: string,
  max: number,
  janelaMs: number,
): Promise<boolean> {
  const supabase = getSupabase();
  try {
    for (let i = 0; i < MAX_RETRIES; i++) {
      const { data, error } = await supabase
        .from("secretaria_rate_limits")
        .select("janela_inicio, contagem")
        .eq("chave", chave)
        .maybeSingle();
      if (error) throw error;

      const agora = Date.now();
      if (!data) {
        const { error: insErr } = await supabase
          .from("secretaria_rate_limits")
          .insert({ chave, janela_inicio: new Date(agora).toISOString(), contagem: 1 });
        if (!insErr) return true;
        if (insErr.code === "23505") continue; // outra requisição criou: tenta de novo
        throw insErr;
      }

      const inicio = new Date(data.janela_inicio as string).getTime();
      const contagem = data.contagem as number;

      if (agora - inicio >= janelaMs) {
        // Janela expirou: reinicia (condicionado ao estado lido).
        const { data: upd, error: updErr } = await supabase
          .from("secretaria_rate_limits")
          .update({ janela_inicio: new Date(agora).toISOString(), contagem: 1 })
          .eq("chave", chave)
          .eq("janela_inicio", data.janela_inicio as string)
          .select("chave");
        if (updErr) throw updErr;
        if (upd && upd.length > 0) return true;
        continue;
      }

      if (contagem >= max) return false;

      const { data: upd, error: updErr } = await supabase
        .from("secretaria_rate_limits")
        .update({ contagem: contagem + 1 })
        .eq("chave", chave)
        .eq("contagem", contagem)
        .select("chave");
      if (updErr) throw updErr;
      if (upd && upd.length > 0) return true;
      // Perdeu a corrida para outra requisição: relê e tenta de novo.
    }
    // Disputa intensa na mesma chave = rajada: nega.
    return false;
  } catch (err) {
    console.error(
      `[ratelimit] falha (${chave.split(":")[0]}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return true;
  }
}

/** IP do cliente (a Vercel preenche x-forwarded-for / x-real-ip). */
export function ipDaRequisicao(request: Request): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const primeiro = xff.split(",")[0]?.trim();
  return primeiro || request.headers.get("x-real-ip")?.trim() || "desconhecido";
}
