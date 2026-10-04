import { getSupabase } from "./supabase.js";

/**
 * Config interna (tabela secretaria_config, chave/valor). Acesso só pelo backend
 * com a service key. Guarda, por exemplo, o token que autentica o agendador de
 * lembretes (pg_cron do Supabase) contra o endpoint de disparo.
 */
export async function getConfig(chave: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_config")
    .select("valor")
    .eq("chave", chave)
    .limit(1);
  if (error) throw new Error(`Falha ao ler config '${chave}': ${error.message}`);
  return ((data?.[0]?.valor as string | undefined) ?? null) || null;
}
