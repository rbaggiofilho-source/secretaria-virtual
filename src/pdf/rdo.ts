import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { RdoRow } from "../memory/context.js";
import { formatDateBr } from "../util/datetime.js";

/**
 * Gera um PDF de Relatório Diário de Obra (RDO) a partir dos registros de uma
 * obra. Usa fontes padrão (Helvetica) — sem dependência de arquivos de fonte,
 * o que mantém a função serverless leve. O texto é saneado para o encoding
 * WinAnsi (Latin-1), suficiente para português.
 *
 * Layout profissional: faixa de cabeçalho com marca, bloco de identificação da
 * obra, seções por dia com tabela de efetivo, bloco de assinatura do
 * responsável técnico (ART/RRT) e rodapé com numeração de páginas.
 */

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 48;
const HEADER_H = 74;
const FOOTER_H = 30;
const CONTENT_W = A4.w - MARGIN * 2;
const CONTENT_TOP = A4.h - HEADER_H - 22;
const CONTENT_BOTTOM = MARGIN + FOOTER_H;

const INK = rgb(0.075, 0.126, 0.11);
const MUTED = rgb(0.4, 0.46, 0.43);
const LINE = rgb(0.85, 0.88, 0.86);
const BRAND = rgb(0.047, 0.36, 0.305);
const BRAND_INK = rgb(0.03, 0.24, 0.2);
const BRAND_SOFT = rgb(0.92, 0.96, 0.94);
const ZEBRA = rgb(0.965, 0.975, 0.97);
const WHITE = rgb(1, 1, 1);
const WHITE_DIM = rgb(0.85, 0.93, 0.9);

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

/** Deixa a primeira letra maiúscula (dia da semana vem em minúsculo do Intl). */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  obra: string;
}

/** Quebra o texto em linhas que cabem na largura dada. */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const rawLine of sanitize(text).split("\n")) {
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

/** Faixa de cabeçalho (marca + título + obra), desenhada em toda página. */
function drawHeaderBand(ctx: Ctx): void {
  const top = A4.h;
  ctx.page.drawRectangle({ x: 0, y: top - HEADER_H, width: A4.w, height: HEADER_H, color: BRAND });
  // filete de acento mais escuro na base da faixa
  ctx.page.drawRectangle({ x: 0, y: top - HEADER_H, width: A4.w, height: 3, color: BRAND_INK });

  ctx.page.drawText("RELATÓRIO DIÁRIO DE OBRA", {
    x: MARGIN,
    y: top - 30,
    size: 9,
    font: ctx.bold,
    color: WHITE_DIM,
  });
  const obra = wrap(ctx.obra, ctx.bold, 17, CONTENT_W - 110)[0] ?? ctx.obra;
  ctx.page.drawText(sanitize(obra), { x: MARGIN, y: top - 52, size: 17, font: ctx.bold, color: WHITE });

  // Marca à direita
  const marca = "Rosana";
  const mW = ctx.bold.widthOfTextAtSize(marca, 15);
  ctx.page.drawText(marca, { x: A4.w - MARGIN - mW, y: top - 34, size: 15, font: ctx.bold, color: WHITE });
  const tag = "assistente de obra";
  const tW = ctx.font.widthOfTextAtSize(tag, 8);
  ctx.page.drawText(tag, { x: A4.w - MARGIN - tW, y: top - 48, size: 8, font: ctx.font, color: WHITE_DIM });
}

function startPage(ctx: Ctx, first = false): void {
  if (!first) ctx.page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.y = CONTENT_TOP;
  drawHeaderBand(ctx);
}

/** Garante espaço vertical; quebra página se faltar. */
function ensure(ctx: Ctx, need: number): void {
  if (ctx.y - need < CONTENT_BOTTOM) startPage(ctx);
}

/** Desenha um parágrafo simples numa coluna (x, largura). */
function paragraph(
  ctx: Ctx,
  text: string,
  opts: { x?: number; width?: number; size?: number; font?: PDFFont; color?: typeof INK; gap?: number } = {},
): void {
  const x = opts.x ?? MARGIN;
  const width = opts.width ?? CONTENT_W;
  const size = opts.size ?? 10;
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? INK;
  const lineH = size * 1.42;
  for (const line of wrap(text, font, size, width)) {
    ensure(ctx, lineH);
    ctx.page.drawText(line, { x, y: ctx.y - size, size, font, color });
    ctx.y -= lineH;
  }
  if (opts.gap) ctx.y -= opts.gap;
}

/** Campo rótulo + valor dentro de uma seção (indentado). */
function campo(ctx: Ctx, rotulo: string, valor: string | null | undefined): void {
  if (!valor || !valor.trim()) return;
  const x = MARGIN + 14;
  const w = CONTENT_W - 14;
  paragraph(ctx, rotulo.toUpperCase(), { x, width: w, size: 7.5, font: ctx.bold, color: BRAND, gap: 1 });
  paragraph(ctx, valor, { x, width: w, size: 10, color: INK, gap: 8 });
}

/** Tabela de efetivo (função × quantidade + total). */
function efetivoTable(ctx: Ctx, efetivo: { funcao: string; qtd: number }[]): void {
  const itens = efetivo.filter((e) => (e.funcao && e.funcao.trim()) || Number(e.qtd));
  if (itens.length === 0) return;
  const total = itens.reduce((s, e) => s + (Number(e.qtd) || 0), 0);

  const x = MARGIN + 14;
  const w = CONTENT_W - 14;
  const qtdW = 60;
  const rowH = 17;
  const size = 9.5;

  paragraph(ctx, "EFETIVO", { x, width: w, size: 7.5, font: ctx.bold, color: BRAND, gap: 3 });

  // precisa caber cabeçalho + linhas + total; se não couber, quebra antes
  ensure(ctx, rowH * (itens.length + 2) + 4);

  // Cabeçalho
  ctx.page.drawRectangle({ x, y: ctx.y - rowH, width: w, height: rowH, color: BRAND_SOFT });
  ctx.page.drawText("FUNÇÃO", { x: x + 8, y: ctx.y - rowH + 5, size: 8, font: ctx.bold, color: BRAND_INK });
  const qh = "QTD.";
  ctx.page.drawText(qh, {
    x: x + w - 8 - ctx.bold.widthOfTextAtSize(qh, 8),
    y: ctx.y - rowH + 5,
    size: 8,
    font: ctx.bold,
    color: BRAND_INK,
  });
  ctx.y -= rowH;

  // Linhas
  itens.forEach((e, i) => {
    if (i % 2 === 1) ctx.page.drawRectangle({ x, y: ctx.y - rowH, width: w, height: rowH, color: ZEBRA });
    const nome = cap(sanitize(String(e.funcao || "-")));
    const nomeMax = w - qtdW - 16;
    const nomeLine = wrap(nome, ctx.font, size, nomeMax)[0] ?? nome;
    ctx.page.drawText(nomeLine, { x: x + 8, y: ctx.y - rowH + 5, size, font: ctx.font, color: INK });
    const q = String(Number(e.qtd) || 0);
    ctx.page.drawText(q, {
      x: x + w - 8 - ctx.font.widthOfTextAtSize(q, size),
      y: ctx.y - rowH + 5,
      size,
      font: ctx.font,
      color: INK,
    });
    ctx.y -= rowH;
  });

  // Total
  ctx.page.drawLine({ start: { x, y: ctx.y }, end: { x: x + w, y: ctx.y }, thickness: 0.75, color: LINE });
  ctx.page.drawText("Total", { x: x + 8, y: ctx.y - rowH + 5, size, font: ctx.bold, color: INK });
  const tq = String(total);
  ctx.page.drawText(tq, {
    x: x + w - 8 - ctx.bold.widthOfTextAtSize(tq, size),
    y: ctx.y - rowH + 5,
    size,
    font: ctx.bold,
    color: INK,
  });
  ctx.y -= rowH + 10;
}

/** Cabeçalho de um dia (barra com data + dia da semana). */
function dayHeader(ctx: Ctx, iso: string): void {
  ensure(ctx, 60);
  const barH = 24;
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - barH, width: CONTENT_W, height: barH, color: BRAND });

  const legivel = formatDateBr(iso); // "terça-feira, 18/08/2026"
  const partes = legivel.split(", ");
  const dataStr = partes.length > 1 ? (partes[1] ?? legivel) : legivel;
  const diaSem = partes.length > 1 ? cap(partes[0] ?? "") : "";

  ctx.page.drawText(sanitize(dataStr), { x: MARGIN + 12, y: ctx.y - barH + 7, size: 12, font: ctx.bold, color: WHITE });
  if (diaSem) {
    const dW = ctx.font.widthOfTextAtSize(diaSem, 10);
    ctx.page.drawText(sanitize(diaSem), {
      x: MARGIN + CONTENT_W - 12 - dW,
      y: ctx.y - barH + 7,
      size: 10,
      font: ctx.font,
      color: WHITE_DIM,
    });
  }
  ctx.y -= barH + 12;
}

/** Bloco de identificação da obra (primeira página). */
function metaBox(ctx: Ctx, entradas: { label: string; valor: string }[]): void {
  const itens = entradas.filter((e) => e.valor && e.valor.trim());
  if (itens.length === 0) return;

  const padX = 14;
  const padY = 12;
  const labelW = 96;
  const size = 10;
  const lineH = size * 1.42;
  const valW = CONTENT_W - padX * 2 - labelW;

  // Mede a altura total antes de desenhar (bloco não quebra — cabe na 1ª página).
  let inner = 0;
  const linhasPorItem = itens.map((e) => Math.max(1, wrap(e.valor, ctx.font, size, valW).length));
  for (const n of linhasPorItem) inner += n * lineH;
  inner += (itens.length - 1) * 6; // espaço entre itens
  const boxH = inner + padY * 2;

  ensure(ctx, boxH + 10);
  const top = ctx.y;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: top - boxH,
    width: CONTENT_W,
    height: boxH,
    color: rgb(0.985, 0.99, 0.988),
    borderColor: LINE,
    borderWidth: 1,
  });
  // acento lateral
  ctx.page.drawRectangle({ x: MARGIN, y: top - boxH, width: 3, height: boxH, color: BRAND });

  let cy = top - padY;
  itens.forEach((e, i) => {
    const linhas = wrap(e.valor, ctx.font, size, valW);
    ctx.page.drawText(e.label.toUpperCase(), {
      x: MARGIN + padX,
      y: cy - size,
      size: 8,
      font: ctx.bold,
      color: MUTED,
    });
    linhas.forEach((ln, j) => {
      ctx.page.drawText(sanitize(ln), {
        x: MARGIN + padX + labelW,
        y: cy - size - j * lineH,
        size,
        font: ctx.font,
        color: INK,
      });
    });
    cy -= (linhasPorItem[i] ?? 1) * lineH + 6;
  });
  ctx.y = top - boxH - 16;
}

/** Bloco de assinatura do responsável técnico (ART/RRT). */
function signatureBlock(ctx: Ctx, responsavel?: string | null): void {
  ensure(ctx, 96);
  ctx.y -= 10;
  const colW = (CONTENT_W - 28) / 2;
  const lineY = ctx.y - 44;

  const cols = [
    { x: MARGIN, titulo: "Responsável Técnico", sub: "ART / RRT nº __________________", nome: responsavel },
    { x: MARGIN + colW + 28, titulo: "Fiscalização / Cliente", sub: "Data: _____ / _____ / _________", nome: null as string | null },
  ];

  for (const c of cols) {
    ctx.page.drawLine({
      start: { x: c.x, y: lineY },
      end: { x: c.x + colW, y: lineY },
      thickness: 0.9,
      color: INK,
    });
    if (c.nome && c.nome.trim()) {
      const nm = wrap(c.nome, ctx.bold, 10, colW)[0] ?? c.nome;
      ctx.page.drawText(sanitize(nm), { x: c.x, y: lineY + 6, size: 10, font: ctx.bold, color: INK });
    }
    ctx.page.drawText(c.titulo, { x: c.x, y: lineY - 14, size: 9, font: ctx.bold, color: INK });
    ctx.page.drawText(c.sub, { x: c.x, y: lineY - 27, size: 8.5, font: ctx.font, color: MUTED });
  }
  ctx.y = lineY - 40;
}

/** Rodapé com numeração — desenhado em todas as páginas ao final. */
function drawFooters(doc: PDFDocument, font: PDFFont, bold: PDFFont, emitido: string): void {
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const y = MARGIN - 6;
    page.drawLine({
      start: { x: MARGIN, y: y + 14 },
      end: { x: A4.w - MARGIN, y: y + 14 },
      thickness: 0.75,
      color: LINE,
    });
    page.drawText("Rosana - assistente de obra", { x: MARGIN, y, size: 8, font, color: MUTED });
    const meio = sanitize(emitido);
    const mW = font.widthOfTextAtSize(meio, 8);
    page.drawText(meio, { x: (A4.w - mW) / 2, y, size: 8, font, color: MUTED });
    const pg = `Página ${i + 1} de ${total}`;
    const pW = bold.widthOfTextAtSize(pg, 8);
    page.drawText(pg, { x: A4.w - MARGIN - pW, y, size: 8, font: bold, color: MUTED });
  });
}

export interface RdoPdfInput {
  obra: string;
  rdos: RdoRow[];
  periodoLabel?: string;
  cliente?: string | null;
  endereco?: string | null;
  responsavel?: string | null;
  emitidoPor?: string | null;
}

/** Constrói o PDF e devolve os bytes. */
export async function buildRdoPdf(input: RdoPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`RDO - ${sanitize(input.obra)}`);
  doc.setCreator("Rosana - assistente de obra");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage([A4.w, A4.h]), y: CONTENT_TOP, font, bold, obra: input.obra };
  startPage(ctx, true);

  // Dias em ordem cronológica (mais antigo -> mais recente).
  const dias = [...input.rdos].sort((a, b) => a.data.localeCompare(b.data));

  // Período (usa o rótulo informado ou deriva do intervalo dos RDOs).
  let periodo = input.periodoLabel ?? "";
  if (!periodo && dias.length > 0) {
    const ini = dias[0]?.data;
    const fim = dias[dias.length - 1]?.data;
    if (ini && fim) {
      const fmt = (d: string) => (formatDateBr(d).split(", ")[1] ?? d);
      periodo = ini === fim ? fmt(ini) : `${fmt(ini)} a ${fmt(fim)}`;
    }
  }

  // Bloco de identificação da obra.
  metaBox(ctx, [
    { label: "Cliente", valor: input.cliente ?? "" },
    { label: "Endereço", valor: input.endereco ?? "" },
    { label: "Período", valor: periodo },
    { label: "Dias registrados", valor: String(dias.length) },
  ]);

  // Seções por dia.
  for (const r of dias) {
    dayHeader(ctx, r.data);
    campo(ctx, "Clima", r.clima);
    if (Array.isArray(r.efetivo)) efetivoTable(ctx, r.efetivo);
    campo(ctx, "Atividades executadas", r.atividades);
    campo(ctx, "Ocorrências", r.ocorrencias);
    campo(ctx, "Materiais recebidos", r.materiais);
    ctx.y -= 6;
    ensure(ctx, 4);
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: A4.w - MARGIN, y: ctx.y },
      thickness: 0.5,
      color: LINE,
    });
    ctx.y -= 16;
  }

  if (dias.length === 0) {
    paragraph(ctx, "Nenhum registro diário no período.", { size: 10, color: MUTED, gap: 8 });
  }

  // Assinaturas.
  signatureBlock(ctx, input.responsavel);

  // Rodapés com numeração (após todas as páginas existirem).
  const hojeCompleto = formatDateBr(new Date().toISOString().slice(0, 10));
  const hoje = hojeCompleto.split(", ")[1] ?? hojeCompleto; // só a data, sem o dia da semana
  const emitido = input.emitidoPor
    ? `Emitido por ${input.emitidoPor} - ${hoje}`
    : `Emitido em ${hoje}`;
  drawFooters(doc, font, bold, emitido);

  return doc.save();
}
