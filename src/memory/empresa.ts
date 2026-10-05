import { getSupabase } from "./supabase.js";
import { waIdVariants } from "./context.js";

/**
 * Versão CORPORATIVA da Rosana (Fase 0/1). Uma EMPRESA agrupa vários WhatsApps
 * (os engenheiros). O acesso aos dados é POR OBRA (o admin monta o contexto e
 * atribui quais engenheiros entram em cada obra — Fase 3). Aqui ficam o cadastro
 * da empresa, a lista de membros e o fluxo de convite/aceite pelo WhatsApp.
 *
 * Tudo isolado por empresa; usuário "pessoal" (sem empresa) segue como hoje.
 */

export type PapelMembro = "admin" | "engenheiro";
export type StatusMembro = "convidado" | "ativo" | "recusado" | "removido";

export interface EmpresaRow {
  id: number;
  nome: string;
  dono_wa: string;
  plano: string;
  teto_membros: number;
  created_at: string;
  assinatura_status?: string | null;
  mp_preapproval_id?: string | null;
  assinatura_em?: string | null;
}

export interface MembroRow {
  id: number;
  empresa_id: number;
  user_wa: string;
  nome: string | null;
  papel: PapelMembro;
  status: StatusMembro;
  convidado_em: string;
  respondido_em: string | null;
}

/**
 * Normaliza um número BR para a forma canônica de armazenamento: 55 + DDD +
 * número COM o nono dígito (13 dígitos). Os lookups usam waIdVariants, que gera
 * as duas formas (12/13), então casa independentemente de como a Meta entregar.
 */
export function canonWa(input: string): string {
  const d = input.replace(/\D/g, "");
  let nac = d;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) nac = d.slice(2);
  if (nac.length === 10 || nac.length === 11) {
    const ddd = nac.slice(0, 2);
    let local = nac.slice(2);
    if (local.length === 8) local = "9" + local; // força o nono dígito
    return "55" + ddd + local;
  }
  return d;
}

/** Cria uma empresa e registra o dono como membro admin ativo. */
export async function criarEmpresa(
  donoWa: string,
  nome: string,
  tetoMembros = 3,
): Promise<EmpresaRow> {
  const supabase = getSupabase();
  const dono = canonWa(donoWa);
  const { data, error } = await supabase
    .from("secretaria_empresas")
    .insert({ nome: nome.trim(), dono_wa: dono, teto_membros: tetoMembros })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao criar empresa: ${error.message}`);
  const empresa = data as EmpresaRow;

  // Dono entra como admin ativo.
  const { error: e2 } = await supabase.from("secretaria_empresa_membros").insert({
    empresa_id: empresa.id,
    user_wa: dono,
    nome: null,
    papel: "admin",
    status: "ativo",
    respondido_em: new Date().toISOString(),
  });
  if (e2 && !e2.message.includes("duplicate")) {
    throw new Error(`Falha ao registrar admin da empresa: ${e2.message}`);
  }

  // As obras que o admin JÁ tinha (pessoais) viram as obras da empresa — assim o
  // contexto que ele montou é reaproveitado e nada "some" do painel ao criar a
  // empresa. Só adota obras ainda sem empresa.
  const { error: e3 } = await supabase
    .from("secretaria_obras")
    .update({ empresa_id: empresa.id })
    .in("user_wa", waIdVariants(donoWa))
    .is("empresa_id", null);
  if (e3) console.error(`[empresa] falha ao adotar obras do admin: ${e3.message}`);

  return empresa;
}

/** Empresa onde o wa é ADMIN ativo (null se não for admin de nenhuma). */
export async function empresaComoAdmin(wa: string): Promise<EmpresaRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_empresa_membros")
    .select("empresa_id, secretaria_empresas!inner(*)")
    .in("user_wa", waIdVariants(wa))
    .eq("papel", "admin")
    .eq("status", "ativo")
    .limit(1);
  if (error) throw new Error(`Falha ao buscar empresa do admin: ${error.message}`);
  const row = data?.[0] as { secretaria_empresas: EmpresaRow } | undefined;
  return row?.secretaria_empresas ?? null;
}

/** Empresa onde o wa é membro ATIVO (admin ou engenheiro). Null se nenhuma. */
export async function empresaDoMembro(wa: string): Promise<EmpresaRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_empresa_membros")
    .select("empresa_id, secretaria_empresas!inner(*)")
    .in("user_wa", waIdVariants(wa))
    .eq("status", "ativo")
    .limit(1);
  if (error) throw new Error(`Falha ao buscar empresa do membro: ${error.message}`);
  const row = data?.[0] as { secretaria_empresas: EmpresaRow } | undefined;
  return row?.secretaria_empresas ?? null;
}

/** Convite PENDENTE (status 'convidado') para este wa, se houver, com o nome da empresa. */
export async function convitePendente(
  wa: string,
): Promise<{ membro: MembroRow; empresa: EmpresaRow } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_empresa_membros")
    .select("*, secretaria_empresas!inner(*)")
    .in("user_wa", waIdVariants(wa))
    .eq("status", "convidado")
    .order("convidado_em", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Falha ao buscar convite: ${error.message}`);
  const row = data?.[0] as (MembroRow & { secretaria_empresas: EmpresaRow }) | undefined;
  if (!row) return null;
  const { secretaria_empresas, ...membro } = row;
  return { membro: membro as MembroRow, empresa: secretaria_empresas };
}

/** Quantos membros a empresa já tem (ativos + convidados pendentes). */
export async function contarMembros(empresaId: number): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("secretaria_empresa_membros")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .in("status", ["ativo", "convidado"]);
  if (error) throw new Error(`Falha ao contar membros: ${error.message}`);
  return count ?? 0;
}

export type ConviteResultado =
  | { ok: true; membro: MembroRow }
  | { ok: false; motivo: "sem_vaga" | "ja_membro" };

/**
 * Registra um convite (status 'convidado') se houver vaga no teto do plano. Não
 * envia a mensagem — quem envia é o caller (pipeline/tool), que também trata o
 * nono dígito. Se o wa já for membro ativo/convidado, não duplica.
 */
export async function convidarMembro(
  empresa: EmpresaRow,
  wa: string,
  nome: string | null,
): Promise<ConviteResultado> {
  const supabase = getSupabase();
  const alvo = canonWa(wa);

  // Já é membro (ativo/convidado) desta empresa?
  const { data: existente } = await supabase
    .from("secretaria_empresa_membros")
    .select("*")
    .eq("empresa_id", empresa.id)
    .in("user_wa", waIdVariants(alvo))
    .in("status", ["ativo", "convidado"])
    .limit(1);
  if (existente && existente.length > 0) return { ok: false, motivo: "ja_membro" };

  if ((await contarMembros(empresa.id)) >= empresa.teto_membros) {
    return { ok: false, motivo: "sem_vaga" };
  }

  // upsert: se havia um 'recusado'/'removido' antigo, reconvida.
  const { data, error } = await supabase
    .from("secretaria_empresa_membros")
    .upsert(
      {
        empresa_id: empresa.id,
        user_wa: alvo,
        nome: nome?.trim() || null,
        papel: "engenheiro",
        status: "convidado",
        convidado_em: new Date().toISOString(),
        respondido_em: null,
      },
      { onConflict: "empresa_id,user_wa" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao convidar membro: ${error.message}`);
  return { ok: true, membro: data as MembroRow };
}

/** Responde um convite: aceitar (status ativo) ou recusar (status recusado). */
export async function responderConvite(membroId: number, aceitar: boolean): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_empresa_membros")
    .update({ status: aceitar ? "ativo" : "recusado", respondido_em: new Date().toISOString() })
    .eq("id", membroId);
  if (error) throw new Error(`Falha ao responder convite: ${error.message}`);
}

/** Lista os membros de uma empresa (para o painel do admin — Fase 2). */
export async function listarMembros(empresaId: number): Promise<MembroRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_empresa_membros")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("convidado_em", { ascending: true });
  if (error) throw new Error(`Falha ao listar membros: ${error.message}`);
  return (data ?? []) as MembroRow[];
}

/** Membership ATIVA do wa (admin ou engenheiro), com a empresa. Null se nenhuma. */
export async function membershipAtiva(
  wa: string,
): Promise<{ empresa: EmpresaRow; membro: MembroRow } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_empresa_membros")
    .select("*, secretaria_empresas!inner(*)")
    .in("user_wa", waIdVariants(wa))
    .eq("status", "ativo")
    .limit(1);
  if (error) throw new Error(`Falha ao buscar membership: ${error.message}`);
  const row = data?.[0] as (MembroRow & { secretaria_empresas: EmpresaRow }) | undefined;
  if (!row) return null;
  const { secretaria_empresas, ...membro } = row;
  return { empresa: secretaria_empresas, membro: membro as MembroRow };
}

/** Todos os user_wa dos membros ATIVOS da empresa, já expandidos em variantes. */
export async function wasDosMembros(empresaId: number): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_empresa_membros")
    .select("user_wa")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo");
  if (error) throw new Error(`Falha ao listar wa dos membros: ${error.message}`);
  const out = new Set<string>();
  for (const r of (data ?? []) as Array<{ user_wa: string }>) {
    for (const v of waIdVariants(r.user_wa)) out.add(v);
  }
  return [...out];
}

/** Nomes das obras da empresa ATRIBUÍDAS a um wa (via secretaria_obra_membros). */
export async function obrasAtribuidas(empresaId: number, wa: string): Promise<string[]> {
  const supabase = getSupabase();
  const { data: vinc, error } = await supabase
    .from("secretaria_obra_membros")
    .select("obra_id")
    .in("user_wa", waIdVariants(wa));
  if (error) throw new Error(`Falha ao listar obras atribuídas: ${error.message}`);
  const ids = (vinc ?? []).map((r) => (r as { obra_id: number }).obra_id);
  if (ids.length === 0) return [];
  const { data: obras, error: e2 } = await supabase
    .from("secretaria_obras")
    .select("nome")
    .eq("empresa_id", empresaId)
    .in("id", ids);
  if (e2) throw new Error(`Falha ao resolver obras atribuídas: ${e2.message}`);
  return (obras ?? []).map((r) => (r as { nome: string }).nome);
}

/**
 * Aplica um PLANO-EMPRESA à empresa: ajusta o teto de membros e o id do plano.
 * `status` reflete o billing ('aguardando' sem MP, 'pendente' até o MP autorizar).
 */
export async function definirPlanoEmpresa(
  empresaId: number,
  plano: { id: string; tetoMembros: number },
  status: string,
  preapprovalId?: string | null,
): Promise<void> {
  const supabase = getSupabase();
  const patch: Record<string, unknown> = {
    plano: plano.id,
    teto_membros: plano.tetoMembros,
    assinatura_status: status,
  };
  if (preapprovalId !== undefined) patch.mp_preapproval_id = preapprovalId;
  const { error } = await supabase.from("secretaria_empresas").update(patch).eq("id", empresaId);
  if (error) throw new Error(`Falha ao definir plano da empresa: ${error.message}`);
}

/** Atualiza o status da assinatura da empresa (chamado pelo webhook do MP). */
export async function atualizarAssinaturaEmpresa(
  empresaId: number,
  dados: { status: string; preapprovalId?: string | null; ativa?: boolean },
): Promise<void> {
  const supabase = getSupabase();
  const patch: Record<string, unknown> = { assinatura_status: dados.status };
  if (dados.preapprovalId) patch.mp_preapproval_id = dados.preapprovalId;
  if (dados.ativa) patch.assinatura_em = new Date().toISOString();
  const { error } = await supabase.from("secretaria_empresas").update(patch).eq("id", empresaId);
  if (error) throw new Error(`Falha ao atualizar assinatura da empresa: ${error.message}`);
}

/** Busca um membro pelo id, confirmando que é da empresa informada. */
export async function getMembro(empresaId: number, membroId: number): Promise<MembroRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_empresa_membros")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("id", membroId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar membro: ${error.message}`);
  return (data as MembroRow | null) ?? null;
}

/** Remove um membro da empresa (status 'removido'; não pode ser o admin/dono). */
export async function removerMembro(empresaId: number, membroId: number): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_empresa_membros")
    .update({ status: "removido", respondido_em: new Date().toISOString() })
    .eq("empresa_id", empresaId)
    .eq("id", membroId)
    .neq("papel", "admin");
  if (error) throw new Error(`Falha ao remover membro: ${error.message}`);
}

export interface ObraEmpresaRow {
  id: number;
  nome: string;
  cliente: string | null;
  endereco: string | null;
  status: string;
}

/** Obras da empresa (secretaria_obras com empresa_id). */
export async function listarObrasEmpresa(empresaId: number): Promise<ObraEmpresaRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_obras")
    .select("id, nome, cliente, endereco, status")
    .eq("empresa_id", empresaId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar obras da empresa: ${error.message}`);
  return (data ?? []) as ObraEmpresaRow[];
}

/** Cria uma obra DA EMPRESA (dono_wa = admin; empresa_id setado). */
export async function criarObraEmpresa(
  empresa: EmpresaRow,
  dados: { nome: string; cliente?: string | null; endereco?: string | null },
): Promise<ObraEmpresaRow> {
  const supabase = getSupabase();
  const nome = dados.nome.trim();
  if (!nome) throw new Error("nome_obrigatorio");
  const { data, error } = await supabase
    .from("secretaria_obras")
    .upsert(
      {
        user_wa: empresa.dono_wa,
        empresa_id: empresa.id,
        nome,
        cliente: dados.cliente?.trim() || null,
        endereco: dados.endereco?.trim() || null,
        status: "ativa",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_wa,nome" },
    )
    .select("id, nome, cliente, endereco, status")
    .single();
  if (error) throw new Error(`Falha ao criar obra da empresa: ${error.message}`);
  return data as ObraEmpresaRow;
}

/** Confirma que a obra pertence à empresa (segurança das atribuições). */
export async function obraDaEmpresa(empresaId: number, obraId: number): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_obras")
    .select("id")
    .eq("id", obraId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao verificar obra: ${error.message}`);
  return !!data;
}

/** user_wa (canônicos) atribuídos a uma obra. */
export async function membrosDaObra(obraId: number): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_obra_membros")
    .select("user_wa")
    .eq("obra_id", obraId);
  if (error) throw new Error(`Falha ao listar membros da obra: ${error.message}`);
  return (data ?? []).map((r) => (r as { user_wa: string }).user_wa);
}

/** Substitui o conjunto de engenheiros atribuídos a uma obra (delete + insert). */
export async function definirMembrosDaObra(obraId: number, userWas: string[]): Promise<void> {
  const supabase = getSupabase();
  const alvos = [...new Set(userWas.map((w) => canonWa(w)))];
  const { error: delErr } = await supabase.from("secretaria_obra_membros").delete().eq("obra_id", obraId);
  if (delErr) throw new Error(`Falha ao limpar atribuições: ${delErr.message}`);
  if (alvos.length === 0) return;
  const rows = alvos.map((user_wa) => ({ obra_id: obraId, user_wa }));
  const { error } = await supabase.from("secretaria_obra_membros").insert(rows);
  if (error) throw new Error(`Falha ao atribuir obra: ${error.message}`);
}
