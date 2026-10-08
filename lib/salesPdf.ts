import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { safePdfText } from "@/lib/pdfText";
import {
  displayDay,
  roundAmount,
  SALES_LABELS,
  salesTotals,
  type CompanySettings,
  type SalesDocument,
} from "@/lib/sales";

export async function generateSalesPdf(
  document: SalesDocument,
  company: CompanySettings,
  logoBytes?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = logoBytes
    ? await pdf.embedPng(logoBytes).catch(() => null)
    : null;
  const width = 595.28,
    height = 841.89,
    margin = 40,
    contentWidth = width - margin * 2;
  const ink = rgb(0.12, 0.17, 0.18),
    muted = rgb(0.36, 0.41, 0.42),
    green = rgb(0.13, 0.36, 0.31),
    border = rgb(0.82, 0.86, 0.84);
  let page = pdf.addPage([width, height]);
  let y = height - margin;
  function safe(value: string) {
    return safePdfText(value, regular);
  }
  function wrapped(value: string, maxWidth: number, size = 10, isBold = false) {
    const font = isBold ? bold : regular;
    const rows: string[] = [];
    for (const paragraph of safe(value).split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) {
          rows.push(line);
          line = "";
        }
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > maxWidth && line) {
            rows.push(line);
            line = "";
          }
          line += char;
        }
      }
      rows.push(line);
    }
    return rows;
  }
  function text(
    value: string,
    x: number,
    baseline: number,
    size = 10,
    isBold = false,
    color = ink,
  ) {
    page.drawText(safe(value), {
      x,
      y: baseline,
      size,
      font: isBold ? bold : regular,
      color,
    });
  }
  function nextPage() {
    page = pdf.addPage([width, height]);
    y = height - margin;
    text("DECORALIA PINTORES", margin, y, 12, true, green);
    text(
      `${SALES_LABELS[document.kind]} ${document.number ?? "BORRADOR"}`,
      310,
      y,
      10,
      true,
    );
    y -= 28;
  }
  function ensure(space: number) {
    if (y - space < 64) nextPage();
  }
  function paragraph(
    value: string,
    maxWidth = contentWidth,
    size = 10,
    isBold = false,
    color = ink,
  ) {
    for (const row of wrapped(value, maxWidth, size, isBold)) {
      ensure(size + 6);
      text(row, margin, y, size, isBold, color);
      y -= size + 5;
    }
  }
  function rule() {
    ensure(15);
    page.drawLine({
      start: { x: margin, y: y + 3 },
      end: { x: width - margin, y: y + 3 },
      color: border,
      thickness: 0.6,
    });
    y -= 12;
  }
  const title = SALES_LABELS[document.kind].toLocaleUpperCase("es");
  if (logo) {
    const logoHeight = (190 * logo.height) / logo.width;
    page.drawImage(logo, {
      x: margin,
      y: y - logoHeight,
      width: 190,
      height: logoHeight,
    });
  } else text("DECORALIA PINTORES", margin, y - 10, 16, true, green);
  text(title, 365, y - 10, 17, true, green);
  text(document.number ?? "BORRADOR SIN EMITIR", 365, y - 30, 11, true);
  text(`Fecha: ${displayDay(document.issue_date)}`, 365, y - 48, 10);
  if (document.kind === "invoice")
    text("Gestión interna", 365, y - 65, 9, false, muted);
  y -= 82;
  paragraph(company.legal_name, contentWidth, 11, true);
  if (company.tax_id)
    paragraph(`NIF / CIF: ${company.tax_id}`, contentWidth, 10, false, muted);
  if (company.address)
    paragraph(company.address, contentWidth, 10, false, muted);
  if (company.email || company.phone)
    paragraph(
      [company.email, company.phone].filter(Boolean).join(" · "),
      contentWidth,
      10,
      false,
      muted,
    );
  y -= 12;
  rule();
  paragraph("CLIENTE", contentWidth, 10, true, green);
  paragraph(
    document.client_name || "Cliente por completar",
    contentWidth,
    11,
    true,
  );
  if (document.client_tax_id) paragraph(`NIF / CIF: ${document.client_tax_id}`);
  if (document.client_address) paragraph(document.client_address);
  if (document.client_email)
    paragraph(document.client_email, contentWidth, 10, false, muted);
  if (document.source_label) {
    y -= 8;
    paragraph(
      `Referencia: ${document.source_label}`,
      contentWidth,
      10,
      false,
      muted,
    );
  }
  if (document.due_date)
    paragraph(
      `Vencimiento: ${displayDay(document.due_date)}`,
      contentWidth,
      10,
      false,
      muted,
    );
  y -= 16;
  function tableHeading() {
    ensure(40);
    page.drawRectangle({
      x: margin,
      y: y - 23,
      width: contentWidth,
      height: 25,
      color: green,
    });
    text("CONCEPTO", margin + 8, y - 14, 9, true, rgb(1, 1, 1));
    text("CANT.", 334, y - 14, 9, true, rgb(1, 1, 1));
    text("PRECIO", 397, y - 14, 9, true, rgb(1, 1, 1));
    text("BASE", 493, y - 14, 9, true, rgb(1, 1, 1));
    y -= 42;
  }
  tableHeading();
  for (const line of document.lines) {
    if (y < 110) {
      nextPage();
      tableHeading();
    }
    const conceptRows = wrapped(line.concept, 273, 11, true);
    const amount = (value: number) =>
      new Intl.NumberFormat("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    text(amount(line.quantity), 334, y, 10);
    text(amount(line.unit_price), 397, y, 10);
    const total = amount(roundAmount(line.quantity * line.unit_price));
    text(
      total,
      width - margin - bold.widthOfTextAtSize(total, 10) - 8,
      y,
      10,
      true,
    );
    for (const row of conceptRows) {
      if (y < 70) {
        nextPage();
        tableHeading();
      }
      text(row, margin + 8, y, 11, true);
      y -= 15;
    }
    if (line.unit) {
      text(
        `Unidad: ${line.unit} · IVA ${line.vat_rate}%`,
        margin + 8,
        y,
        9,
        false,
        muted,
      );
      y -= 15;
    } else {
      text(`IVA ${line.vat_rate}%`, margin + 8, y, 9, false, muted);
      y -= 15;
    }
    if (line.notes)
      for (const row of wrapped(line.notes, contentWidth - 16, 10)) {
        if (y < 70) {
          nextPage();
          tableHeading();
        }
        text(row, margin + 8, y, 10, false, muted);
        y -= 15;
      }
    y -= 9;
    rule();
  }
  const totals = salesTotals(document.lines);
  ensure(75 + totals.groups.length * 18);
  y -= 8;
  text("Base imponible", 340, y, 11);
  const euro = (value: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" })
      .format(value)
      .replace(/\u00a0/g, " ");
  function right(value: string, baseline: number, isBold = false) {
    text(
      value,
      width -
        margin -
        (isBold ? bold : regular).widthOfTextAtSize(safe(value), 11),
      baseline,
      11,
      isBold,
    );
  }
  right(euro(totals.subtotal), y);
  y -= 22;
  for (const [rate, group] of totals.groups) {
    text(`IVA ${rate}%`, 340, y, 11);
    right(euro(group.tax), y);
    y -= 18;
  }
  y -= 5;
  page.drawRectangle({
    x: 330,
    y: y - 28,
    width: width - margin - 330,
    height: 34,
    color: green,
  });
  text("TOTAL", 340, y - 16, 11, true, rgb(1, 1, 1));
  const totalText = safe(euro(totals.total));
  page.drawText(totalText, {
    x: width - margin - 10 - bold.widthOfTextAtSize(totalText, 12),
    y: y - 16,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  y -= 56;
  if (document.notes) {
    ensure(60);
    paragraph("OBSERVACIONES", contentWidth, 11, true, green);
    y -= 4;
    paragraph(document.notes);
    y -= 12;
  }
  if (document.kind === "invoice" && company.iban) {
    ensure(45);
    paragraph(`Cuenta de pago: ${company.iban}`, contentWidth, 10);
  }
  if (document.kind === "delivery_note") {
    ensure(85);
    y -= 15;
    paragraph("Recibido conforme", contentWidth, 11, true);
    y -= 35;
    rule();
    paragraph("Nombre, fecha y firma", contentWidth, 9, false, muted);
  }
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: margin, y: 46 },
      end: { x: width - margin, y: 46 },
      color: border,
      thickness: 0.6,
    });
    p.drawText(
      safe(
        document.status === "draft"
          ? "BORRADOR - Pendiente de emisión"
          : `${title} ${document.number}`,
      ),
      { x: margin, y: 31, size: 9, font: regular, color: muted },
    );
    p.drawText(`${index + 1} / ${pages.length}`, {
      x: width - margin - 32,
      y: 31,
      size: 9,
      font: regular,
      color: muted,
    });
  });
  pdf.setTitle(
    `${SALES_LABELS[document.kind]} ${document.number ?? "Borrador"}`,
  );
  pdf.setAuthor(company.legal_name);
  return pdf.save();
}
