import { getSupabase } from "../memory/supabase.js";
import { waIdVariants } from "../memory/context.js";
import { sendTextMessage } from "../whatsapp/client.js";
import {
  consultarNfse,
  emitirNfse,
  enviarEmailNfse,
  nfseConfigured,
  nfseEnviarEmail,
  type Tomador,
} from "./nfeio.js";

/**
 * NOTA FISCAL AUTOMÁTICA a cada pagamento aprovado no Mercado Pago (assinatura
 * mensal ou pacote extra). Fila em `secretaria_notas_fiscais`, uma linha por
 * pagamento (mp_payment_id ÚNICO = nunca emite duas notas do mesmo pagamento,
 * mesmo com notificações repetidas ou chegando por dois tópicos).
 *
 * Ciclo: pendente → (emitir) processando → (consultar) emitida | erro.
 *  - Sem emissor configurado: fica em `aguardando_emissor` e sai sozinha depois.
 *  - Falta CPF/CNPJ ou e-mail do tomador: `dados_faltando` (o dono é avisado).
 * O tique de minuto do pg_cron (bomdia?acao=lembretes) chama
 * processarNotasPendentes() para emitir, acompanhar e mandar o e-mail.
 */

export type StatusNota =
  | "pendente"
  | "aguardando_emissor"
  | "dados_faltando"
  | "processando"
  | "emitida"
  | "erro";

interface NotaRow {
  id: number;
  mp_payment_id: string;
  user_wa: string | null;
  empresa_id: number | null;
  origem: string;
  descricao: string;
  valor: number;
  status: StatusNota;
  nfse_id: string | null;
  tentativas: number;
}

/**
 * Enfileira a nota de um pagamento aprovado e tenta emitir na hora. Idempotente:
 * se o pagamento já tem nota, não faz nada. Nunca lança (pagamento já foi
 * creditado; a nota é um passo posterior).
 */
export async function registrarNotaDePagamento(input: {
  mpPaymentId: string;
  userWa?: string | null;
  empresaId?: number | null;
  origem: "assinatura" | "pacote";
  descricao: string;
  valor: number;
}): Promise<void> {
  try {
    const { data, error } = await getSupabase()
      .from("secretaria_notas_fiscais")
      .insert({
        mp_payment_id: input.mpPaymentId,
        user_wa: input.userWa ?? null,
        empresa_id: input.empresaId ?? null,
        origem: input.origem,
        descricao: input.descricao,
        valor: Number(input.valor.toFixed(2)),
        status: "pendente",
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return; // já enfileirada (notificação repetida)
      throw new Error(error.message);
    }
    await avancar(data as NotaRow);
  } catch (err) {
    console.error("[nf] registrar:", err instanceof Error ? err.message : err);
  }
}

/** Tique de minuto: emite as pendentes e acompanha as que estão processando. */
export async function processarNotasPendentes(): Promise<{ processadas: number }> {
  const { data, error } = await getSupabase()
    .from("secretaria_notas_fiscais")
    .select("*")
    .in("status", ["pendente", "aguardando_emissor", "processando"])
    .lt("tentativas", 60)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`Falha ao ler notas: ${error.message}`);
  const rows = (data ?? []) as NotaRow[];
  // Sem emissor configurado, nada a fazer (evita gastar tentativas à toa).
  if (!nfseConfigured()) return { processadas: 0 };
  for (const nota of rows) await avancar(nota);
  return { processadas: rows.length };
}

async function avancar(nota: NotaRow): Promise<void> {
  try {
    if (nota.status === "processando" && nota.nfse_id) {
      await acompanhar(nota);
      return;
    }
    if (!nfseConfigured()) {
      if (nota.status !== "aguardando_emissor") await atualizar(nota.id, { status: "aguardando_emissor" });
      return;
    }
    const tomador = await carregarTomador(nota);
    if (!tomador) {
      await atualizar(nota.id, { status: "dados_faltando", erro: "Tomador sem CPF/CNPJ ou e-mail no cadastro" });
      await avisarDono(
        `Nota fiscal não emitida: falta CPF/CNPJ ou e-mail no cadastro de ${nota.user_wa ?? `empresa ${nota.empresa_id}`} ` +
          `(pagamento ${nota.mp_payment_id}, R$ ${nota.valor.toFixed(2).replace(".", ",")}). Complete o cadastro e reprocesse no /admin.`,
      );
      return;
    }
    const r = await emitirNfse({
      tomador,
      descricao: nota.descricao,
      valor: nota.valor,
      externalId: `mp-${nota.mp_payment_id}`,
    });
    await atualizar(nota.id, { status: "processando", nfse_id: r.id, tentativas: nota.tentativas + 1 });
    if (r.flowStatus) await acompanhar({ ...nota, status: "processando", nfse_id: r.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[nf] avançar:", msg);
    await atualizar(nota.id, { tentativas: nota.tentativas + 1, erro: msg.slice(0, 500) }).catch(() => {});
  }
}

async function acompanhar(nota: NotaRow): Promise<void> {
  const n = await consultarNfse(nota.nfse_id!);
  if (!n) {
    await atualizar(nota.id, { tentativas: nota.tentativas + 1 });
    return;
  }
  if (n.flowStatus === "Issued") {
    const enviado = nfseEnviarEmail() ? await enviarEmailNfse(n.id) : false;
    await atualizar(nota.id, {
      status: "emitida",
      numero: n.numero,
      email_enviado: enviado,
      emitida_em: new Date().toISOString(),
      erro: null,
    });
    return;
  }
  if (n.flowStatus === "IssueFailed") {
    await atualizar(nota.id, { status: "erro", erro: n.flowMessage ?? "Prefeitura recusou a nota" });
    await avisarDono(
      `Nota fiscal RECUSADA (pagamento ${nota.mp_payment_id}, R$ ${nota.valor.toFixed(2).replace(".", ",")}): ` +
        `${n.flowMessage ?? "sem detalhe"}. Veja no painel da NFE.io.`,
    );
    return;
  }
  // Ainda processando na prefeitura.
  await atualizar(nota.id, { tentativas: nota.tentativas + 1 });
}

/** Dados do tomador: o usuário que pagou (ou o dono da empresa). */
async function carregarTomador(nota: NotaRow): Promise<Tomador | null> {
  const supabase = getSupabase();
  let wa = nota.user_wa;
  if (!wa && nota.empresa_id) {
    const { data } = await supabase
      .from("secretaria_empresas")
      .select("dono_wa")
      .eq("id", nota.empresa_id)
      .maybeSingle();
    wa = (data as { dono_wa?: string } | null)?.dono_wa ?? null;
  }
  if (!wa) return null;
  const { data } = await supabase
    .from("secretaria_usuarios")
    .select("nome, nome_completo, cpf, email")
    .in("user_wa", waIdVariants(wa));
  for (const r of (data ?? []) as Array<Record<string, string | null>>) {
    const doc = (r.cpf ?? "").replace(/\D/g, "");
    const email = (r.email ?? "").trim();
    if ((doc.length === 11 || doc.length === 14) && email) {
      return { nome: (r.nome_completo || r.nome || "Cliente").trim(), documento: doc, email };
    }
  }
  return null;
}

/** Últimas notas (painel /admin). */
export async function listarNotas(limite = 50): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase()
    .from("secretaria_notas_fiscais")
    .select("id, mp_payment_id, user_wa, empresa_id, origem, descricao, valor, status, numero, email_enviado, erro, created_at, emitida_em")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Falha ao listar notas: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/**
 * Recoloca na fila uma nota com erro ou sem dados (depois de corrigir o cadastro
 * ou o problema na prefeitura). Uma nota recusada gera um NOVO pedido de emissão.
 */
export async function reprocessarNota(id: number): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("secretaria_notas_fiscais")
    .update({ status: "pendente", tentativas: 0, nfse_id: null, erro: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["erro", "dados_faltando"])
    .select("*");
  if (error) throw new Error(`Falha ao reprocessar nota: ${error.message}`);
  const row = (data ?? [])[0] as NotaRow | undefined;
  if (!row) return false;
  await avancar(row);
  return true;
}

async function atualizar(id: number, patch: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabase()
    .from("secretaria_notas_fiscais")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao atualizar nota: ${error.message}`);
}

/** Avisa o dono no WhatsApp (melhor esforço; depende da janela de 24h). */
async function avisarDono(texto: string): Promise<void> {
  try {
    const { data } = await getSupabase()
      .from("secretaria_usuarios")
      .select("user_wa")
      .eq("dono", true)
      .limit(1)
      .maybeSingle();
    const wa = (data as { user_wa?: string } | null)?.user_wa ?? process.env.ALLOWED_WHATSAPP_NUMBER;
    if (wa) await sendTextMessage(wa, `⚠️ ${texto}`);
  } catch (err) {
    console.error("[nf] aviso ao dono:", err instanceof Error ? err.message : err);
  }
}
