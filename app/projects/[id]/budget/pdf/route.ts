import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sortBudgetItems } from "@/lib/budget";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import type { BudgetItem, Project, Room } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const VAT_RATE = 0.21;
const INK = rgb(0.08, 0.15, 0.19);
const MUTED = rgb(0.32, 0.38, 0.42);
const LINE = rgb(0.82, 0.85, 0.83);
const MOSS = rgb(0.13, 0.37, 0.32);
const LIGHT = rgb(0.95, 0.96, 0.94);

const BUDGET_COMMENTS = [
  "Presupuesto valido 30 dias.",
  "Incluido mano de obra, materiales y herramientas necesarias para realizar los trabajos.",
  "Nuestros operarios cumplen todos los requisitos exigidos por la normativa aplicable al trabajador (cursos seguridad, alta seguridad social, etc.).",
  "Para la aceptacion de los trabajos rogamos nos devuelvan este presupuesto firmado.",
  "Las unidades de obra no mencionadas en este presupuesto se facturaran aparte.",
  "Se aceptan pagos con tarjeta bancaria.",
  "Forma de pago: 35 % al empezar, 35 % a la mitad, resto al concluir.",
];

const BUDGET_TERMS =
  "Le informamos que cualquier dato de caracter personal que nos haya facilitado sera tratado por tiempo indefinido, mientras que no comunique lo contrario, por DECORALIA PINTORES, con la finalidad de prestar los servicios solicitados, atender sus consultas y enviarle informacion que pueda ser de su interes. Podra ejercitar sus derechos de acceso, rectificacion, supresion, oposicion, limitacion del tratamiento, portabilidad de datos y a no ser objeto de decisiones individualizadas automatizadas (incluida la elaboracion de perfiles), enviando solicitud firmada por correo postal con asunto Proteccion de Datos a la direccion: Apart correos 192 (11.130 Chiclana de la Frontera) o info@decoraliapintores.es";

type Context = {
  params: {
    id: string;
  };
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

function money(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  })
    .format(value)
    .replace(/\u00a0/g, " ");
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function budgetNumber(project: Project) {
  return `${new Date(project.created_at).getFullYear()}-${project.id.slice(0, 4).toUpperCase()}`;
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const paragraphs = String(text || "").split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}

function drawLabelValue(page: PDFPage, label: string, value: string, x: number, y: number, fonts: Fonts) {
  page.drawText(label, { x, y, size: 7.5, font: fonts.bold, color: MUTED });
  page.drawText(value || "-", { x, y: y - 11, size: 9, font: fonts.bold, color: INK });
}

function sectionTitle(page: PDFPage, title: string, y: number, fonts: Fonts) {
  page.drawText(title.toUpperCase(), { x: MARGIN, y, size: 9.5, font: fonts.bold, color: INK });
  page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 6 }, thickness: 0.8, color: LINE });
  return y - 22;
}

function newPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function ensurePage(pdf: PDFDocument, page: PDFPage, y: number, needed: number) {
  if (y - needed > MARGIN) return { page, y };
  return { page: newPage(pdf), y: PAGE_HEIGHT - MARGIN };
}

function drawTableHeader(page: PDFPage, y: number, headers: Array<{ label: string; x: number; width: number; align?: "right" }>, fonts: Fonts) {
  page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_WIDTH - MARGIN * 2, height: 18, color: INK });
  for (const header of headers) {
    const textWidth = fonts.bold.widthOfTextAtSize(header.label, 7.5);
    const x = header.align === "right" ? header.x + header.width - textWidth : header.x;
    page.drawText(header.label, { x, y: y + 1, size: 7.5, font: fonts.bold, color: rgb(1, 1, 1) });
  }
  return y - 18;
}

export async function GET(_request: NextRequest, { params }: Context) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single<Project>();

  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const [{ data: itemsData }, { data: roomsData }] = await Promise.all([
    supabase.from("budget_items").select("*").eq("project_id", params.id).order("created_at", { ascending: true }).returns<BudgetItem[]>(),
    supabase.from("rooms").select("*").eq("project_id", params.id).order("created_at", { ascending: true }).returns<Room[]>(),
  ]);

  const items = sortBudgetItems(itemsData ?? []);
  const rooms = roomsData ?? [];
  const taxableBase = items.reduce((sum, item) => sum + Number(item.total), 0);
  const vat = taxableBase * VAT_RATE;
  const total = taxableBase + vat;
  const issuedAt = new Date();
  const expiresAt = addDays(issuedAt, 14);

  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  let page = newPage(pdf);
  let y = PAGE_HEIGHT - MARGIN;

  const logoBytes = await readFile(path.join(process.cwd(), "public", "decoralia-logo.png"));
  const logo = await pdf.embedPng(logoBytes);
  const logoWidth = 245;
  const logoHeight = (logo.height / logo.width) * logoWidth;
  page.drawImage(logo, { x: MARGIN, y: y - logoHeight, width: logoWidth, height: logoHeight });

  page.drawText("PRESUPUESTO", { x: PAGE_WIDTH - MARGIN - 155, y: y - 20, size: 20, font: fonts.bold, color: INK });
  drawLabelValue(page, "Nº PRESUPUESTO", budgetNumber(project), PAGE_WIDTH - MARGIN - 155, y - 48, fonts);
  drawLabelValue(page, "FECHA EMISIÓN", shortDate(issuedAt), PAGE_WIDTH - MARGIN - 155, y - 78, fonts);
  drawLabelValue(page, "FECHA VENCIMIENTO", shortDate(expiresAt), PAGE_WIDTH - MARGIN - 155, y - 108, fonts);
  y -= Math.max(logoHeight, 125) + 16;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.2, color: INK });
  y -= 22;

  page.drawText("Decoralia Pintores", { x: MARGIN, y, size: 11, font: fonts.bold, color: INK });
  page.drawText("Teléfono: 653 529 351 · Email: info@decoraliapintores.com · CIF/NIF: -", {
    x: MARGIN,
    y: y - 13,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });

  y -= 42;
  y = sectionTitle(page, "Datos del cliente", y, fonts);
  const colW = (PAGE_WIDTH - MARGIN * 2 - 14) / 2;
  drawLabelValue(page, "NOMBRE", project.client_name, MARGIN, y, fonts);
  drawLabelValue(page, "TELÉFONO", project.client_phone, MARGIN + colW + 14, y, fonts);
  drawLabelValue(page, "DIRECCIÓN", project.address, MARGIN, y - 34, fonts);
  drawLabelValue(page, "EMAIL", project.client_email || "-", MARGIN + colW + 14, y - 34, fonts);

  y -= 80;
  ({ page, y } = ensurePage(pdf, page, y, 80));
  y = sectionTitle(page, "Conceptos del presupuesto", y, fonts);
  const conceptHeaders = [
    { label: "DESCRIPCIÓN", x: MARGIN + 8, width: 260 },
    { label: "CANT.", x: 342, width: 46, align: "right" as const },
    { label: "PRECIO", x: 396, width: 62, align: "right" as const },
    { label: "IMPORTE", x: 468, width: 56, align: "right" as const },
  ];
  y = drawTableHeader(page, y, conceptHeaders, fonts);

  if (items.length === 0) {
    page.drawText("No hay conceptos añadidos.", { x: MARGIN + 8, y: y - 12, size: 8, font: fonts.regular, color: MUTED });
    y -= 30;
  } else {
    for (const item of items) {
      const descriptionLines = wrapText(item.concept, fonts.bold, 8, 250);
      const noteLines = item.notes ? wrapText(item.notes, fonts.regular, 7.2, 250) : [];
      const rowHeight = Math.max(22, 11 * descriptionLines.length + 9 * noteLines.length + 8);
      ({ page, y } = ensurePage(pdf, page, y, rowHeight + 22));
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: LINE });
      let textY = y - 12;
      for (const line of descriptionLines) {
        page.drawText(line, { x: MARGIN + 8, y: textY, size: 8, font: fonts.bold, color: INK });
        textY -= 10;
      }
      for (const line of noteLines) {
        page.drawText(line, { x: MARGIN + 8, y: textY, size: 7.2, font: fonts.regular, color: MUTED });
        textY -= 9;
      }
      const qty = item.unit ? `${Number(item.quantity)} ${item.unit}` : "";
      if (qty) {
        page.drawText(qty, { x: 388 - fonts.regular.widthOfTextAtSize(qty, 7.6), y: y - 12, size: 7.6, font: fonts.regular, color: INK });
      }
      const price = item.unit ? money(Number(item.unit_price)) : "";
      if (price) {
        page.drawText(price, { x: 458 - fonts.regular.widthOfTextAtSize(price, 7.6), y: y - 12, size: 7.6, font: fonts.regular, color: INK });
      }
      const amount = money(Number(item.total));
      page.drawText(amount, { x: 524 - fonts.bold.widthOfTextAtSize(amount, 7.8), y: y - 12, size: 7.8, font: fonts.bold, color: INK });
      y -= rowHeight;
    }
  }

  y -= 16;
  ({ page, y } = ensurePage(pdf, page, y, 150));
  y = sectionTitle(page, "Comentarios", y, fonts);
  for (const comment of BUDGET_COMMENTS) {
    const lines = wrapText(`- ${comment}`, fonts.regular, 7.4, PAGE_WIDTH - MARGIN * 2);
    ({ page, y } = ensurePage(pdf, page, y, 9 * lines.length + 6));
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y: y - 10, size: 7.4, font: fonts.regular, color: INK });
      y -= 9;
    }
    y -= 2;
  }

  y -= 6;
  ({ page, y } = ensurePage(pdf, page, y, 90));
  y = sectionTitle(page, "Terminos y condiciones", y, fonts);
  const termsLines = wrapText(BUDGET_TERMS, fonts.regular, 6.8, PAGE_WIDTH - MARGIN * 2);
  for (const line of termsLines) {
    ({ page, y } = ensurePage(pdf, page, y, 10));
    page.drawText(line, { x: MARGIN, y: y - 9, size: 6.8, font: fonts.regular, color: MUTED });
    y -= 8;
  }

  if (rooms.length > 0) {
    y -= 16;
    ({ page, y } = ensurePage(pdf, page, y, 95));
    y = sectionTitle(page, "Desglose de medidas por habitación", y, fonts);
    const roomHeaders = [
      { label: "HABITACIÓN", x: MARGIN + 8, width: 140 },
      { label: "MEDIDAS", x: 184, width: 115 },
      { label: "M2", x: 318, width: 40, align: "right" as const },
      { label: "€/M2", x: 370, width: 52, align: "right" as const },
      { label: "IMPORTE", x: 464, width: 60, align: "right" as const },
    ];
    y = drawTableHeader(page, y, roomHeaders, fonts);

    for (const room of rooms) {
      const scope =
        room.paint_scope === "manual_area"
          ? "Metro cuadrado"
          : room.paint_scope === "ceiling_only"
            ? "Solo techo"
            : room.paint_scope === "walls_only"
              ? "Solo paredes"
            : "Techo + paredes";
      const roomText = `${room.name} · ${scope}`;
      const notes = room.notes ? `Notas: ${room.notes}` : "";
      const roomLines = wrapText(roomText, fonts.bold, 7.8, 136);
      const noteLines = notes ? wrapText(notes, fonts.regular, 7, 136) : [];
      const rowHeight = Math.max(26, 10 * roomLines.length + 8 * noteLines.length + 10);
      ({ page, y } = ensurePage(pdf, page, y, rowHeight + 22));
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: LINE });
      let textY = y - 12;
      for (const line of roomLines) {
        page.drawText(line, { x: MARGIN + 8, y: textY, size: 7.8, font: fonts.bold, color: INK });
        textY -= 9;
      }
      for (const line of noteLines) {
        page.drawText(line, { x: MARGIN + 8, y: textY, size: 7, font: fonts.regular, color: MUTED });
        textY -= 8;
      }

      const measures =
        room.paint_scope === "manual_area"
          ? `${Number(room.manual_area ?? room.total_paintable_area).toFixed(2)} m2 directos`
          : room.paint_scope === "ceiling_only"
          ? `${room.length} x ${room.width} techo`
          : room.paint_scope === "walls_only"
          ? `${room.length} x ${room.width} x ${room.height} paredes`
          : `${room.length} x ${room.width} x ${room.height}`;
      page.drawText(measures, { x: 184, y: y - 12, size: 7.4, font: fonts.regular, color: INK });
      if (room.paint_scope === "manual_area") {
        page.drawText("Introducido manualmente", { x: 184, y: y - 23, size: 6.7, font: fonts.regular, color: MUTED });
      } else {
        page.drawText(`Techo ${Number(room.ceiling_area).toFixed(2)}`, { x: 184, y: y - 23, size: 6.7, font: fonts.regular, color: MUTED });
      }
      if (room.paint_scope !== "ceiling_only" && room.paint_scope !== "manual_area") {
        page.drawText(`Paredes ${Number(room.wall_area).toFixed(2)} · Desc. ${Number(room.openings_area).toFixed(2)}`, {
          x: 184,
          y: y - 32,
          size: 6.7,
          font: fonts.regular,
          color: MUTED,
        });
      }

      const area = Number(room.total_paintable_area).toFixed(2);
      page.drawText(area, { x: 358 - fonts.regular.widthOfTextAtSize(area, 7.4), y: y - 12, size: 7.4, font: fonts.regular, color: INK });
      const unitPrice = money(Number(room.unit_price ?? 0));
      page.drawText(unitPrice, { x: 422 - fonts.regular.widthOfTextAtSize(unitPrice, 7.4), y: y - 12, size: 7.4, font: fonts.regular, color: INK });
      const amount = money(Number(room.total_paintable_area) * Number(room.unit_price ?? 0));
      page.drawText(amount, { x: 524 - fonts.bold.widthOfTextAtSize(amount, 7.6), y: y - 12, size: 7.6, font: fonts.bold, color: INK });
      y -= rowHeight;
    }
  }

  y -= 18;
  ({ page, y } = ensurePage(pdf, page, y, 95));
  const totalsX = PAGE_WIDTH - MARGIN - 210;
  page.drawRectangle({ x: totalsX, y: y - 66, width: 210, height: 66, color: LIGHT });
  page.drawText("Base imponible:", { x: totalsX + 12, y: y - 18, size: 8.5, font: fonts.bold, color: MUTED });
  page.drawText(money(taxableBase), { x: totalsX + 198 - fonts.bold.widthOfTextAtSize(money(taxableBase), 8.5), y: y - 18, size: 8.5, font: fonts.bold, color: INK });
  page.drawText("IVA (21%):", { x: totalsX + 12, y: y - 36, size: 8.5, font: fonts.bold, color: MUTED });
  page.drawText(money(vat), { x: totalsX + 198 - fonts.bold.widthOfTextAtSize(money(vat), 8.5), y: y - 36, size: 8.5, font: fonts.bold, color: INK });
  page.drawRectangle({ x: totalsX, y: y - 98, width: 210, height: 26, color: INK });
  page.drawText("TOTAL:", { x: totalsX + 12, y: y - 88, size: 10, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText(money(total), { x: totalsX + 198 - fonts.bold.widthOfTextAtSize(money(total), 10.5), y: y - 88, size: 10.5, font: fonts.bold, color: rgb(1, 1, 1) });

  page.drawText("Gracias por confiar en Decoralia Pintores.", {
    x: MARGIN,
    y: MARGIN,
    size: 8,
    font: fonts.bold,
    color: MUTED,
  });

  const bytes = await pdf.save();
  const filename = `Presupuesto-Decoralia-${sanitizeFileName(project.client_name || project.name)}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
