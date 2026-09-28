import { getSupabase } from "../memory/supabase.js";
import { listUsoMes } from "../memory/uso.js";

/**
 * Métricas do painel de administração. Trabalha sobre os dados REAIS do banco.
 * Importante: uma linha por variante de wa_id (nono dígito) — para NÃO contar o
 * mesmo usuário duas vezes, deduplicamos por (email || nome) quando o email
 * existe, senão pela menor variante do wa. "Consumo" é um PROXY por volume de
 * mensagens (não há API de saldo dos provedores de IA).
 */

export interface UsuarioAdmin {
  user_wa: string;
  nome: string | null;
  email: string | null;
  plano: string | null;
  status: string | null;
  assinatura_status: string | null;
  ativo: boolean;
  dono: boolean;
  criado_em: string | null;
  assinatura_em: string | null;
  mensagens: number; // proxy de consumo/atividade
  /** Uso REAL do mês corrente (secretaria_uso): mensagens e custo de IA+STT. */
  mensagens_mes: number;
  custo_usd_mes: number;
}

interface UsuarioRaw {
  user_wa: string;
  nome: string | null;
  email: string | null;
  plano: string | null;
  status: string | null;
  assinatura_status: string | null;
  ativo: boolean;
  dono: boolean;
  created_at: string | null;
  assinatura_em: string | null;
}

/** Deduplica variantes de wa_id do mesmo usuário. */
function chaveUsuario(u: UsuarioRaw): string {
  if (u.email) return `email:${u.email.toLowerCase()}`;
  return `wa:${u.user_wa.replace(/^55/, "").replace(/^(\d\d)9(\d{8})$/, "$1$2")}`;
}

async function carregarUsuarios(): Promise<UsuarioAdmin[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_usuarios")
    .select("user_wa, nome, email, plano, status, assinatura_status, ativo, dono, created_at, assinatura_em")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar usuários: ${error.message}`);
  const raw = (data ?? []) as UsuarioRaw[];

  // Contagem de mensagens por variante de wa (proxy de consumo).
  const contagem = new Map<string, number>();
  const { data: convs } = await supabase
    .from("secretaria_conversations")
    .select("user_wa");
  for (const c of (convs ?? []) as { user_wa: string }[]) {
    contagem.set(c.user_wa, (contagem.get(c.user_wa) ?? 0) + 1);
  }

  // Uso real do mês (custo medido a partir do usage da API). Falha = zeros.
  const usoMes = new Map<string, { mensagens: number; custo: number }>();
  try {
    for (const u of await listUsoMes()) {
      usoMes.set(u.user_wa, { mensagens: u.mensagens, custo: u.custo_usd });
    }
  } catch (err) {
    console.error("[admin] uso do mês:", err instanceof Error ? err.message : err);
  }

  // Deduplica por chaveUsuario, somando mensagens das variantes e preferindo a
  // linha mais "completa" (com email/nome).
  const porChave = new Map<string, UsuarioAdmin>();
  for (const u of raw) {
    const chave = chaveUsuario(u);
    const msgs = contagem.get(u.user_wa) ?? 0;
    const mes = usoMes.get(u.user_wa) ?? { mensagens: 0, custo: 0 };
    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, {
        user_wa: u.user_wa,
        nome: u.nome,
        email: u.email,
        plano: u.plano,
        status: u.status,
        assinatura_status: u.assinatura_status,
        ativo: u.ativo,
        dono: u.dono,
        criado_em: u.created_at,
        assinatura_em: u.assinatura_em,
        mensagens: msgs,
        mensagens_mes: mes.mensagens,
        custo_usd_mes: mes.custo,
      });
    } else {
      existente.mensagens += msgs;
      existente.mensagens_mes += mes.mensagens;
      existente.custo_usd_mes += mes.custo;
      if (!existente.email && u.email) existente.email = u.email;
      if (u.ativo) existente.ativo = true;
      if (u.dono) existente.dono = true;
    }
  }
  return [...porChave.values()];
}

export interface OverviewAdmin {
  totais: {
    usuarios: number;
    ativos: number;
    pendentes: number;
    cancelados: number;
    novos30d: number;
    saidas30d: number;
  };
  porPlano: { plano: string; total: number; ativos: number }[];
  porStatusAssinatura: { status: string; total: number }[];
  novosPorDia: { data: string; total: number }[]; // últimos 30 dias
  topConsumo: {
    nome: string | null;
    email: string | null;
    plano: string | null;
    mensagens: number;
    mensagens_mes: number;
    custo_usd_mes: number;
  }[];
  mensagensTotais: number;
  /** Custo real de IA+STT do mês corrente (todos os usuários, sem o dono). */
  custoIaMesUsd: number;
}

export async function buildOverview(): Promise<OverviewAdmin> {
  const usuarios = (await carregarUsuarios()).filter((u) => !u.dono); // dono fora das métricas de negócio
  const agora = Date.now();
  const trintaDias = 30 * 24 * 60 * 60 * 1000;

  const ativos = usuarios.filter((u) => u.ativo).length;
  const pendentes = usuarios.filter((u) => !u.ativo && u.assinatura_status === "pendente").length;
  const cancelados = usuarios.filter((u) => u.assinatura_status === "cancelled").length;
  const novos30d = usuarios.filter(
    (u) => u.criado_em && agora - new Date(u.criado_em).getTime() <= trintaDias,
  ).length;
  const saidas30d = usuarios.filter(
    (u) =>
      u.assinatura_status === "cancelled" &&
      u.assinatura_em &&
      agora - new Date(u.assinatura_em).getTime() <= trintaDias,
  ).length;

  const planoMap = new Map<string, { total: number; ativos: number }>();
  for (const u of usuarios) {
    const p = u.plano || "sem_plano";
    const cur = planoMap.get(p) ?? { total: 0, ativos: 0 };
    cur.total += 1;
    if (u.ativo) cur.ativos += 1;
    planoMap.set(p, cur);
  }

  const statusMap = new Map<string, number>();
  for (const u of usuarios) {
    const s = u.assinatura_status || "nenhuma";
    statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
  }

  // Novos por dia nos últimos 30 dias.
  const dias: { data: string; total: number }[] = [];
  const base = new Date();
  const contagemDia = new Map<string, number>();
  for (const u of usuarios) {
    if (!u.criado_em) continue;
    const d = new Date(u.criado_em);
    if (agora - d.getTime() > trintaDias) continue;
    const key = d.toISOString().slice(0, 10);
    contagemDia.set(key, (contagemDia.get(key) ?? 0) + 1);
  }
  for (let i = 29; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dias.push({ data: key, total: contagemDia.get(key) ?? 0 });
  }

  const topConsumo = [...usuarios]
    .sort((a, b) => b.custo_usd_mes - a.custo_usd_mes || b.mensagens - a.mensagens)
    .slice(0, 10)
    .map((u) => ({
      nome: u.nome,
      email: u.email,
      plano: u.plano,
      mensagens: u.mensagens,
      mensagens_mes: u.mensagens_mes,
      custo_usd_mes: u.custo_usd_mes,
    }));
  const mensagensTotais = usuarios.reduce((s, u) => s + u.mensagens, 0);
  const custoIaMesUsd = usuarios.reduce((s, u) => s + u.custo_usd_mes, 0);

  return {
    totais: { usuarios: usuarios.length, ativos, pendentes, cancelados, novos30d, saidas30d },
    porPlano: [...planoMap.entries()].map(([plano, v]) => ({ plano, ...v })),
    porStatusAssinatura: [...statusMap.entries()].map(([status, total]) => ({ status, total })),
    novosPorDia: dias,
    topConsumo,
    mensagensTotais,
    custoIaMesUsd,
  };
}

/** Troca o plano de um usuário (todas as variantes do wa; nunca o dono). */
export async function setUsuarioPlano(userWa: string, plano: string): Promise<void> {
  const supabase = getSupabase();
  const { waIdVariants } = await import("../memory/context.js");
  const { error } = await supabase
    .from("secretaria_usuarios")
    .update({ plano })
    .in("user_wa", waIdVariants(userWa))
    .eq("dono", false);
  if (error) throw new Error(`Falha ao trocar plano: ${error.message}`);
}

/** Lista de usuários para a aba de gestão (dedup, dono incluído no fim). */
export async function listUsuariosAdmin(): Promise<UsuarioAdmin[]> {
  const usuarios = await carregarUsuarios();
  return usuarios.sort((a, b) => {
    if (a.dono !== b.dono) return a.dono ? 1 : -1;
    return (b.criado_em ?? "").localeCompare(a.criado_em ?? "");
  });
}

/** Liga/desliga o acesso de um usuário (todas as variantes do wa). */
export async function setUsuarioAtivo(userWa: string, ativo: boolean): Promise<void> {
  const supabase = getSupabase();
  const { waIdVariants } = await import("../memory/context.js");
  const { error } = await supabase
    .from("secretaria_usuarios")
    .update({ ativo, status: ativo ? "ativo" : "inativo" })
    .in("user_wa", waIdVariants(userWa))
    .eq("dono", false); // nunca mexe no dono
  if (error) throw new Error(`Falha ao atualizar usuário: ${error.message}`);
}
