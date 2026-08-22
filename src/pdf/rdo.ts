import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { RdoRow } from "../memory/context.js";
import { formatDateBr } from "../util/datetime.js";

/**
 * Gera um PDF de Relatório Diário de Obra (RDO) a partir dos registros de uma
 * obra. Usa fontes padrão (Helvetica) — sem dependência de arquivos de fonte,
 * o que mantém a função serverless leve. O texto é saneado para o encoding
 * WinAnsi (Latin-1), suficiente para português.
 */

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 48;
const INK = rgb(0.075, 0.126, 0.11);
const MUTED = rgb(0.34, 0.41, 0.38);
const LINE = rgb(0.86, 0.89, 0.87);
const BRAND = rgb(0.047, 0.36, 0.305);

/** Remove/normaliza caracteres que o WinAnsi não codifica (evita exceção). */
function sanitize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "-")
    .split("")
    .filter((ch) => ch.charCodeAt(0) <= 255)
    .join("");
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.y = A4.h - MARGIN;
}

function ensure(ctx: Ctx, need: number): void {
  if (ctx.y - need < MARGIN) newPage(ctx);
}

/** Quebra o texto em linhas que cabem na largura útil. */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    let line = "";
    for (const word of rawLine.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function drawText(
  ctx: Ctx,
  text: string,
  opts: { size?: number; font?: PDFFont; color?: typeof INK; gap?: number } = {},
): void {
  const size = opts.size ?? 10.5;
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? INK;
  const maxW = A4.w - MARGIN * 2;
  const lineH = size * 1.4;
  for (const line of wrap(sanitize(text), font, size, maxW)) {
    ensure(ctx, lineH);
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y - size, size, font, color });
    ctx.y -= lineH;
  }
  if (opts.gap) ctx.y -= opts.gap;
}

function hr(ctx: Ctx): void {
  ensure(ctx, 12);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 4 },
    end: { x: A4.w - MARGIN, y: ctx.y - 4 },
    thickness: 0.75,
    color: LINE,
  });
  ctx.y -= 14;
}

/** Rótulo + valor num campo do RDO (só desenha se houver valor). */
function campo(ctx: Ctx, rotulo: string, valor: string | null | undefined): void {
  if (!valor || !valor.trim()) return;
  drawText(ctx, rotulo.toUpperCase(), { size: 8, font: ctx.bold, color: MUTED, gap: 1 });
  drawText(ctx, valor, { size: 10.5, gap: 6 });
}

export interface RdoPdfInput {
  obra: string;
  rdos: RdoRow[];
  periodoLabel?: string;
}

/** Constrói o PDF e devolve os bytes. */
export async function buildRdoPdf(input: RdoPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`RDO - ${sanitize(input.obra)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage([A4.w, A4.h]), y: A4.h - MARGIN, font, bold };

  // Cabeçalho
  drawText(ctx, "RELATÓRIO DIÁRIO DE OBRA", { size: 9, font: bold, color: BRAND, gap: 2 });
  drawText(ctx, input.obra, { size: 20, font: bold, gap: 2 });
  const sub = input.periodoLabel
    ? `Período: ${input.periodoLabel}  ·  ${input.rdos.length} dia(s)`
    : `${input.rdos.length} dia(s) registrado(s)`;
  drawText(ctx, sub, { size: 9.5, color: MUTED, gap: 4 });
  hr(ctx);

  // Dias (mais antigo -> mais recente para leitura cronológica)
  const dias = [...input.rdos].sort((a, b) => a.data.localeCompare(b.data));
  for (const r of dias) {
    ensure(ctx, 90);
    drawText(ctx, formatDateBr(r.data), { size: 13, font: bold, color: BRAND, gap: 4 });

    campo(ctx, "Clima", r.clima);

    if (Array.isArray(r.efetivo) && r.efetivo.length > 0) {
      const total = r.efetivo.reduce((s, e) => s + (Number(e.qtd) || 0), 0);
      const linhas = r.efetivo.map((e) => `${e.qtd} ${e.funcao}`).join(", ");
      campo(ctx, `Efetivo (total ${total})`, linhas);
    }

    campo(ctx, "Atividades", r.atividades);
    campo(ctx, "Ocorrências", r.ocorrencias);
    campo(ctx, "Materiais recebidos", r.materiais);

    ctx.y -= 4;
    hr(ctx);
  }

  // Rodapé simples na última página
  drawText(ctx, "Gerado pela Rosana — assistente de obra.", {
    size: 8,
    color: MUTED,
  });

  return doc.save();
}
