import type { PDFFont } from "pdf-lib";

const REPLACEMENTS: Record<string, string> = {
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u2026": "...",
  "\u201c": '"',
  "\u201d": '"',
  "\u2018": "'",
  "\u2019": "'",
  "\u2022": "-",
};

export function safePdfText(
  value: string | number | null | undefined,
  font: PDFFont,
) {
  const text = String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200d\ufeff]/g, "");

  return [...text]
    .map((character) => {
      // Paragraph separators are layout instructions, not font glyphs.
      if (character === "\n") return character;
      const candidate = REPLACEMENTS[character] ?? character;
      try {
        font.encodeText(candidate);
        return candidate;
      } catch {
        return " ";
      }
    })
    .join("");
}
