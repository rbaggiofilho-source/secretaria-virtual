import { getSupabase } from "../memory/supabase.js";
import { listUsoMes } from "../memory/uso.js";
import { ufDoWa, pracaDoWa } from "./geo.js";

/**
 * Métricas do painel de CONTROLE (administração). Trabalha sobre os dados REAIS
 * do banco. Importante: uma linha por variante de wa_id (nono dígito) — para NÃO
 * contar o mesmo usuário duas vezes, deduplicamos por (email || wa normalizado).
 * "Consumo"/"tempo de uso" são PROXYS por volume de mensagens e dias ativos (não
 * há API de saldo dos provedores de IA nem cronômetro de sessão).
 */

export interface UsuarioAdmin {
  user_wa: string;
  nome: string | null;
  email: string | null;
  plano: string | null;
  status: string | null;
  assinatura_status: string | null;
  profissao: string | null;
  uf: string | null;
  ativo: boolean;
  dono: boolean;
  criado_em: string | null;
  assinatura_em: string | null;
  mensagens: number; // proxy de consumo/atividade (todo o histórico)
  /** Uso REAL do mês corrente (secretaria_uso): mensagens e custo de IA+STT. */
  mensagens_mes: number;
  custo_usd_mes: number;
  /** Dias distintos com atividade nos últimos 30 dias (proxy de engajamento). */
  dias_ativos_30d: number;
  /** Mensagens nos últimos 30 dias (proxy de tempo de uso). */
  mensagens_30d: number;
}

interface UsuarioRaw {
  user_wa: string;
  nome: string | null;
  email: string | null;
  plano: string | null;
  status: string | null;
  assinatura_status: string | null;
  profissao: string | null;
  ativo: boolean;
  dono: boolean;
  created_at: string | null;
  assinatura_em: string | null;
}

/** Deduplica variantes de wa_id do mesmo usuário. */
function chaveUsuario(wa: string, email: string | null): string {
  if (email) return `email:${email.toLowerCase()}`;
  return `wa:${wa.replace(/^55/, "").replace(/^(\d\d)9(\d{8})$/, "$1$2")}`;
}

const DIA_MS = 24 * 60 * 60 * 1000;

async function carregarUsuarios(): Promise<UsuarioAdmin[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_usuarios")
    .select("user_wa, nome, email, plano, status, assinatura_status, profissao, ativo, dono, created_at, assinatura_em")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar usuários: ${error.message}`);
  const raw = (data ?? []) as UsuarioRaw[];

  // Conversas: contagem total + atividade dos últimos 30 dias (proxy de uso).
  const contagem = new Map<string, number>(); // por wa, todo o histórico
  const msgs30 = new Map<string, number>(); // por wa, últimos 30d
  const dias30 = new Map<string, Set<string>>(); // por wa, dias distintos 30d
  const corte30 = Date.now() - 30 * DIA_MS;
  const { data: convs } = await supabase
    .from("secretaria_conversations")
    .select("user_wa, created_at");
  for (const c of (convs ?? []) as { user_wa: string; created_at: string | null }[]) {
    contagem.set(c.user_wa, (contagem.get(c.user_wa) ?? 0) + 1);
    if (c.created_at && new Date(c.created_at).getTime() >= corte30) {
      msgs30.set(c.user_wa, (msgs30.get(c.user_wa) ?? 0) + 1);
      const dia = c.created_at.slice(0, 10);
      const set = dias30.get(c.user_wa) ?? new Set<string>();
      set.add(dia);
      dias30.set(c.user_wa, set);
    }
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

  // Deduplica por chaveUsuario, somando as métricas das variantes e preferindo a
  // linha mais "completa" (com email/nome/profissão).
  const porChave = new Map<string, UsuarioAdmin>();
  const diasPorChave = new Map<string, Set<string>>();
  for (const u of raw) {
    const chave = chaveUsuario(u.user_wa, u.email);
    const msgs = contagem.get(u.user_wa) ?? 0;
    const mes = usoMes.get(u.user_wa) ?? { mensagens: 0, custo: 0 };
    const m30 = msgs30.get(u.user_wa) ?? 0;
    const d30 = dias30.get(u.user_wa) ?? new Set<string>();
    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, {
        user_wa: u.user_wa,
        nome: u.nome,
        email: u.email,
        plano: u.plano,
        status: u.status,
        assinatura_status: u.assinatura_status,
        profissao: u.profissao,
        uf: ufDoWa(u.user_wa),
        ativo: u.ativo,
        dono: u.dono,
        criado_em: u.created_at,
        assinatura_em: u.assinatura_em,
        mensagens: msgs,
        mensagens_mes: mes.mensagens,
        custo_usd_mes: mes.custo,
        dias_ativos_30d: 0,
        mensagens_30d: m30,
      });
      diasPorChave.set(chave, new Set(d30));
    } else {
      existente.mensagens += msgs;
      existente.mensagens_mes += mes.mensagens;
      existente.custo_usd_mes += mes.custo;
      existente.mensagens_30d += m30;
      if (!existente.email && u.email) existente.email = u.email;
      if (!existente.profissao && u.profissao) existente.profissao = u.profissao;
      if (!existente.uf) existente.uf = ufDoWa(u.user_wa);
      if (u.ativo) existente.ativo = true;
      if (u.dono) existente.dono = true;
      const set = diasPorChave.get(chave)!;
      for (const d of d30) set.add(d);
    }
  }
  for (const [chave, u] of porChave) {
    u.dias_ativos_30d = diasPorChave.get(chave)?.size ?? 0;
  }
  return [...porChave.values()];
}

/** Normaliza o texto livre de profissão para agrupar variações comuns. */
function normalizarProfissao(p: string | null): string {
  const t = (p ?? "").trim().toLowerCase();
  if (!t) return "Não informado";
  const semAcento = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/(engenheir|eng\.?\s|^eng$)/.test(semAcento)) {
    if (/civil/.test(semAcento)) return "Engenheiro(a) Civil";
    return "Engenheiro(a)";
  }
  if (/arquitet/.test(semAcento)) return "Arquiteto(a)";
  if (/(mestre de obra|mestre-de-obra)/.test(semAcento)) return "Mestre de obras";
  if (/(empreiteir|empresari|dono|propriet|socio|ceo|diretor|gestor|gerente)/.test(semAcento))
    return "Dono(a)/Gestor(a)";
  if (/(tecnic|tecnolog)/.test(semAcento)) return "Técnico(a)";
  if (/(pedreir|eletricist|encanad|pintor|servente)/.test(semAcento)) return "Profissional de campo";
  // Capitaliza a 1ª letra de cada palavra do texto original.
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface OverviewAdmin {
  periodoDias: number;
  totais: {
    usuarios: number;
    ativos: number;
    inativos: number;
    pendentes: number;
    cancelados: number;
    novos: number; // na janela
    saidas: number; // na janela
  };
  porPlano: { plano: string; total: number; ativos: number }[];
  porStatusAssinatura: { status: string; total: number }[];
  novosPorDia: { data: string; total: number }[]; // dentro da janela
  topConsumo: {
    nome: string | null;
    email: string | null;
    plano: string | null;
    mensagens: number;
    mensagens_mes: number;
    custo_usd_mes: number;
  }[];
  /** Presença geográfica por UF (DDD do número). */
  geo: { uf: string; total: number; ativos: number }[];
  /** Cidade/região aproximada (praça do DDD) — pista, não verdade. */
  cidades: { cidade: string; uf: string | null; total: number; ativos: number }[];
  /** Distribuição por profissão (texto livre normalizado). */
  profissoes: { profissao: string; total: number }[];
  /** Proxy de "tempo de uso" (mensagens e dias ativos nos últimos 30d). */
  uso: {
    usuariosComAtividade: number;
    mediaMensagensMes: number;
    mediaMensagensSemana: number;
    mediaMensagensDia: number;
    mediaDiasAtivosMes: number;
  };
  mensagensTotais: number;
  /** Custo real de IA+STT do mês corrente (todos os usuários, sem o dono). */
  custoIaMesUsd: number;
  /** Custo médio medido por mensagem (US$) — base da calculadora de planos. */
  custoMedioMensagemUsd: number;
}

export async function buildOverview(periodoDias = 30): Promise<OverviewAdmin> {
  const janela = [7, 30, 90, 365].includes(periodoDias) ? periodoDias : 30;
  const usuarios = (await carregarUsuarios()).filter((u) => !u.dono); // dono fora das métricas de negócio
  const agora = Date.now();
  const janelaMs = janela * DIA_MS;

  const ativos = usuarios.filter((u) => u.ativo).length;
  const inativos = usuarios.length - ativos;
  const pendentes = usuarios.filter((u) => !u.ativo && u.assinatura_status === "pendente").length;
  const cancelados = usuarios.filter((u) => u.assinatura_status === "cancelled").length;
  const novos = usuarios.filter(
    (u) => u.criado_em && agora - new Date(u.criado_em).getTime() <= janelaMs,
  ).length;
  const saidas = usuarios.filter(
    (u) =>
      u.assinatura_status === "cancelled" &&
      u.assinatura_em &&
      agora - new Date(u.assinatura_em).getTime() <= janelaMs,
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

  // Novos por dia dentro da janela (até 365; o front agrega se precisar).
  const dias: { data: string; total: number }[] = [];
  const base = new Date();
  const contagemDia = new Map<string, number>();
  for (const u of usuarios) {
    if (!u.criado_em) continue;
    const d = new Date(u.criado_em);
    if (agora - d.getTime() > janelaMs) continue;
    const key = d.toISOString().slice(0, 10);
    contagemDia.set(key, (contagemDia.get(key) ?? 0) + 1);
  }
  for (let i = janela - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * DIA_MS);
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
  const msgsMesTotais = usuarios.reduce((s, u) => s + u.mensagens_mes, 0);
  const custoMedioMensagemUsd = msgsMesTotais > 0 ? custoIaMesUsd / msgsMesTotais : 0;

  // Geografia por UF.
  const geoMap = new Map<string, { total: number; ativos: number }>();
  for (const u of usuarios) {
    if (!u.uf) continue;
    const cur = geoMap.get(u.uf) ?? { total: 0, ativos: 0 };
    cur.total += 1;
    if (u.ativo) cur.ativos += 1;
    geoMap.set(u.uf, cur);
  }
  const geo = [...geoMap.entries()]
    .map(([uf, v]) => ({ uf, ...v }))
    .sort((a, b) => b.total - a.total);

  // Cidade/região aproximada (praça do DDD).
  const cidadeMap = new Map<string, { uf: string | null; total: number; ativos: number }>();
  for (const u of usuarios) {
    const cidade = pracaDoWa(u.user_wa);
    if (!cidade) continue;
    const cur = cidadeMap.get(cidade) ?? { uf: u.uf, total: 0, ativos: 0 };
    cur.total += 1;
    if (u.ativo) cur.ativos += 1;
    cidadeMap.set(cidade, cur);
  }
  const cidades = [...cidadeMap.entries()]
    .map(([cidade, v]) => ({ cidade, ...v }))
    .sort((a, b) => b.total - a.total);

  // Profissões (texto livre normalizado).
  const profMap = new Map<string, number>();
  for (const u of usuarios) {
    const p = normalizarProfissao(u.profissao);
    profMap.set(p, (profMap.get(p) ?? 0) + 1);
  }
  const profissoes = [...profMap.entries()]
    .map(([profissao, total]) => ({ profissao, total }))
    .sort((a, b) => b.total - a.total);

  // Proxy de "tempo de uso" nos últimos 30 dias (só quem teve atividade).
  const comAtividade = usuarios.filter((u) => u.mensagens_30d > 0);
  const n = comAtividade.length;
  const somaMsg30 = comAtividade.reduce((s, u) => s + u.mensagens_30d, 0);
  const somaDias30 = comAtividade.reduce((s, u) => s + u.dias_ativos_30d, 0);
  const mediaMensagensMes = n > 0 ? somaMsg30 / n : 0;
  const uso = {
    usuariosComAtividade: n,
    mediaMensagensMes,
    mediaMensagensSemana: mediaMensagensMes / (30 / 7),
    mediaMensagensDia: mediaMensagensMes / 30,
    mediaDiasAtivosMes: n > 0 ? somaDias30 / n : 0,
  };

  return {
    periodoDias: janela,
    totais: { usuarios: usuarios.length, ativos, inativos, pendentes, cancelados, novos, saidas },
    porPlano: [...planoMap.entries()].map(([plano, v]) => ({ plano, ...v })),
    porStatusAssinatura: [...statusMap.entries()].map(([status, total]) => ({ status, total })),
    novosPorDia: dias,
    topConsumo,
    geo,
    cidades,
    profissoes,
    uso,
    mensagensTotais,
    custoIaMesUsd,
    custoMedioMensagemUsd,
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
