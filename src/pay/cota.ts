import type { UsuarioRow } from "../memory/context.js";
import { waIdVariants } from "../memory/context.js";
import { getSupabase } from "../memory/supabase.js";
import { getUsoMes, type UsoMes } from "../memory/uso.js";
import { getPlanoDb } from "./planos-db.js";
import { PACOTES, PLANOS, type Plano, type Recurso } from "./planos.js";

/**
 * O que um usuário PODE fazer (recursos do plano) e quanto AINDA pode usar no
 * mês (limite do plano + pacotes extras − uso). Resolvido sempre no servidor.
 *
 * - Dono: sem limite nenhum.
 * - Sem plano gravado (beta/legado): tratado como Construtora (não perde nada).
 * - Falha ao ler plano/uso: LIBERA (fail-open) — nunca travar o usuário por
 *   problema de infra; o pior caso é um mês com uso acima do teto.
 */

export interface Direito {
  plano: Plano;
  ilimitado: boolean;
}

export async function resolverDireito(usuario: UsuarioRow): Promise<Direito> {
  if (usuario.dono) return { plano: PLANOS.construtora, ilimitado: true };
  const plano = await getPlanoDb(usuario.plano ?? "construtora").catch(
    () => PLANOS.construtora,
  );
  return { plano, ilimitado: false };
}

export function temRecurso(d: Direito, r: Recurso): boolean {
  return d.ilimitado || d.plano.recursos.includes(r);
}

export interface Saldo {
  uso: UsoMes;
  mensagens: { usado: number; limite: number; restante: number };
  fotos: { usado: number; limite: number; restante: number };
  audioSeg: { usado: number; limite: number; restante: number };
}

export function calcularSaldo(d: Direito, uso: UsoMes): Saldo {
  const lim = d.plano.limites;
  const item = (usado: number, limite: number) => ({
    usado,
    limite: d.ilimitado ? Infinity : limite,
    restante: d.ilimitado ? Infinity : Math.max(0, limite - usado),
  });
  return {
    uso,
    mensagens: item(uso.mensagens, lim.mensagens + uso.extra_mensagens),
    fotos: item(uso.fotos, lim.fotos + uso.extra_fotos),
    audioSeg: item(uso.audio_seg, lim.audioMin * 60 + uso.extra_audio_seg),
  };
}

export async function saldoDoUsuario(usuario: UsuarioRow, d?: Direito): Promise<Saldo> {
  const direito = d ?? (await resolverDireito(usuario));
  return calcularSaldo(direito, await getUsoMes(usuario.user_wa));
}

// ---------------------------------------------------------------------------
// Limite de obras distintas
// ---------------------------------------------------------------------------

const TABELAS_COM_OBRA = [
  "secretaria_custos",
  "secretaria_rdo",
  "secretaria_fotos",
  "secretaria_documentos",
  "secretaria_materiais",
] as const;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Nomes (normalizados) das obras que o usuário já usa: cadastro + lançamentos. */
export async function obrasConhecidas(userWa: string): Promise<Set<string>> {
  const supabase = getSupabase();
  const was = waIdVariants(userWa);
  const nomes = new Set<string>();
  const consultas = [
    supabase.from("secretaria_obras").select("nome").in("user_wa", was),
    ...TABELAS_COM_OBRA.map((t) => supabase.from(t).select("obra").in("user_wa", was).not("obra", "is", null)),
  ];
  const resultados = await Promise.all(consultas);
  for (const r of resultados) {
    if (r.error) throw new Error(`Falha ao contar obras: ${r.error.message}`);
    for (const row of (r.data ?? []) as Array<Record<string, unknown>>) {
      const n = String(row.nome ?? row.obra ?? "");
      if (n.trim()) nomes.add(norm(n));
    }
  }
  return nomes;
}

/**
 * Pode usar esta obra? Obra já conhecida (mesmo nome, ou um contém o outro —
 * "CCC" x "Obra CCC") sempre pode; obra NOVA só se ainda couber no plano.
 * Devolve null se pode, ou a mensagem de bloqueio.
 */
export async function checarObra(
  usuario: UsuarioRow,
  d: Direito,
  obra: string | null | undefined,
): Promise<string | null> {
  const limite = d.plano.limites.obras;
  if (d.ilimitado || limite === null || !obra || !obra.trim()) return null;
  const alvo = norm(obra);
  const conhecidas = await obrasConhecidas(usuario.user_wa);
  for (const c of conhecidas) {
    if (c === alvo || c.includes(alvo) || alvo.includes(c)) return null;
  }
  if (conhecidas.size < limite) return null;
  return (
    `O plano ${d.plano.nome} permite até ${limite} obra${limite > 1 ? "s" : ""} ` +
    `e ${usuario.nome} já tem ${conhecidas.size}. Para lançar em uma obra nova, é preciso ` +
    `subir de plano (${proximoPlano(d.plano)?.nome ?? "Rosana Construtora"}).`
  );
}

// ---------------------------------------------------------------------------
// Textos de limite / upgrade (usados pelo pipeline e pelas tools)
// ---------------------------------------------------------------------------

export function proximoPlano(p: Plano): Plano | null {
  if (p.id === "agenda") return PLANOS.obra;
  if (p.id === "obra") return PLANOS.construtora;
  return null;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Menu de pacotes para responder "PACOTE X" (sem passar pela IA). */
export function menuPacotes(d: Direito): string {
  const linhas = Object.values(PACOTES)
    .filter((p) => !p.exige || temRecurso(d, p.exige))
    .map((p) => `• *PACOTE ${codigoPacote(p.id)}* — ${p.nome} por ${brl(p.valor)}`);
  const prox = proximoPlano(d.plano);
  const upgrade = prox
    ? `\n\nOu suba para o *${prox.nome}* (${brl(prox.valor)}/mês) e ganhe mais limite todo mês.`
    : "";
  return `${linhas.join("\n")}\n\nÉ só responder com o código (ex.: PACOTE 100). Os pacotes valem até o fim do mês.${upgrade}`;
}

export function codigoPacote(id: string): string {
  switch (id) {
    case "mensagens_100":
      return "100";
    case "mensagens_300":
      return "300";
    case "fotos_50":
      return "FOTOS";
    case "audio_120":
      return "AUDIO";
    default:
      return id.toUpperCase();
  }
}

/** "PACOTE 100" / "pacote fotos" → id do pacote (ou null). */
export function pacoteDoTexto(texto: string): string | null {
  const m = /^\s*pacote\s+(100|300|fotos?|[aá]udios?)\s*$/i.exec(texto);
  if (!m) return null;
  const c = m[1]!.toLowerCase();
  if (c === "100") return "mensagens_100";
  if (c === "300") return "mensagens_300";
  if (c.startsWith("foto")) return "fotos_50";
  return "audio_120";
}

export function textoLimite(
  tipo: "mensagens" | "fotos" | "audio" | "fotos_fora_do_plano",
  d: Direito,
): string {
  if (tipo === "fotos_fora_do_plano") {
    const prox = proximoPlano(d.plano) ?? PLANOS.obra;
    return (
      `Fotos de obra e leitura de nota fiscal não fazem parte do plano ${d.plano.nome}. ` +
      `Elas estão no *${prox.nome}* (${brl(prox.valor)}/mês), junto com Diário de Obra em PDF ` +
      "e prazos de documentos. Quer subir de plano? Me avisa que eu te passo o caminho."
    );
  }
  const oque =
    tipo === "mensagens"
      ? "o limite de mensagens"
      : tipo === "fotos"
        ? "o limite de fotos/notas fiscais"
        : "o limite de áudio";
  return (
    `Você atingiu ${oque} do plano ${d.plano.nome} este mês. ` +
    "Para continuar agora, escolha um pacote extra:\n\n" +
    menuPacotes(d)
  );
}

/** Aviso único quando o uso cruza 80% (anexado ao fim da resposta). */
export function avisoOitentaPorCento(antes: number, depois: number, limite: number): string | null {
  if (!Number.isFinite(limite) || limite <= 0) return null;
  const marco = Math.ceil(limite * 0.8);
  if (antes < marco && depois >= marco) {
    return (
      `\n\n_(Aviso: você já usou ${depois} de ${limite} mensagens do seu plano este mês. ` +
      "Se precisar de mais, responda PACOTE 100.)_"
    );
  }
  return null;
}
