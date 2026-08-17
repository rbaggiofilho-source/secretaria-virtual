import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../config/env";

/**
 * Cliente Supabase único (service role). Só roda no backend — a service key
 * ignora RLS e jamais deve chegar ao cliente.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export type MemoryKind = "fato" | "obra" | "apelido" | "pendencia" | "preferencia";

export interface MemoryRow {
  id: number;
  user_wa: string;
  kind: MemoryKind;
  content: string;
  obra: string | null;
  status: "aberta" | "concluida";
  created_at: string;
  updated_at: string;
}
