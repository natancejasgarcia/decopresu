"use server";

import { inflateRawSync } from "node:zlib";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { formatCurrency } from "@/lib/calculations";
import type { BudgetItem, Project, ProjectFile, Room, RoomModule } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof requireUserProfile>>["supabase"];

const MAX_AI_DOCUMENT_CHARS = 14000;
const MAX_AI_FILE_CHARS = 3500;

const budgetItemSchema = z.object({
  project_id: z.string().uuid(),
  concept: z.string().trim().min(1),
  notes: z.string().trim().optional(),
  quantity: z.preprocess((value) => (value === "" || value === null ? 1 : normalizeDecimalInput(value)), z.coerce.number().positive()),
  unit: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()),
  unit_price: z.preprocess(normalizeDecimalInput, z.coerce.number().min(0)),
});

const generatedBudgetSchema = z.object({
  items: z
    .array(
      z.object({
        concept: z.string().trim().min(1).max(140),
        notes: z.string().trim().max(1800).optional().nullable(),
        quantity: z.preprocess((value) => parseFlexibleNumber(value, 1), z.number().positive()),
        unit: z.string().trim().max(20).optional().nullable(),
        unit_price: z.preprocess((value) => parseFlexibleNumber(value, 0), z.number().min(0)),
      }),
    )
    .min(1)
    .max(8),
});

type GeneratedBudgetItem = z.infer<typeof generatedBudgetSchema>["items"][number];

export async function createBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const parsed = budgetItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { ok: false, error: "Revisa que concepto, cantidad y precio tengan valor. Puedes usar coma o punto en los decimales." };
  }

  const sortOrder = await getNextBudgetSortOrder(supabase, parsed.data.project_id);
  const createdAt = new Date().toISOString();
  const itemId = crypto.randomUUID();
  const row = {
    id: itemId,
    ...parsed.data,
    notes: parsed.data.notes || null,
    sort_order: sortOrder,
  };
  const { error } = await insertBudgetRows(supabase, [
    row,
  ]);

  if (error) {
    return { ok: false, error: error.message };
  }

  await supabase
    .from("projects")
    .update({ status: "Presupuestado", last_activity_at: new Date().toISOString() })
    .eq("id", parsed.data.project_id);

  revalidatePath(`/projects/${parsed.data.project_id}`);
  revalidatePath("/dashboard");
  return {
    ok: true,
    item: {
      id: itemId,
      project_id: parsed.data.project_id,
      concept: parsed.data.concept,
      notes: parsed.data.notes || null,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      unit_price: parsed.data.unit_price,
      total: Math.round(parsed.data.quantity * parsed.data.unit_price * 100) / 100,
      sort_order: sortOrder,
      created_at: createdAt,
    },
  };
}

export async function generateBudgetItemsWithAIAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().safeParse(formData.get("project_id"));

  if (!projectId.success) {
    return { ok: false, error: "No se encontro la obra para generar el presupuesto." };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Falta OPENAI_API_KEY en las variables de entorno." };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId.data)
    .single<Project>();

  if (projectError || !project) {
    return { ok: false, error: projectError?.message ?? "No se pudo leer la obra." };
  }

  const { data: files, error: filesError } = await supabase
    .from("project_files")
    .select("*")
    .eq("project_id", projectId.data)
    .order("created_at", { ascending: false })
    .limit(12)
    .returns<ProjectFile[]>();

  if (filesError) {
    return { ok: false, error: filesError.message };
  }

  const imageUrls = await getProjectImageSignedUrls(supabase, files ?? []);
  const documentText = await getProjectDocumentText(supabase, files ?? []);
  const prompt = buildAIBudgetPrompt(project, files ?? [], documentText);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres un presupuestador experto para Decoralia Pintores. Generas conceptos claros, profesionales y editables para presupuestos de pintura, laca, barnizado, microcemento y reparaciones. Responde solo JSON valido.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...imageUrls.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, error: `OpenAI no pudo generar el presupuesto: ${errorText.slice(0, 240)}` };
  }

  const completion = await response.json();
  const content = completion?.choices?.[0]?.message?.content;
  const json = parseAIJson(content);
  const parsed = generatedBudgetSchema.safeParse(normalizeAIBudgetJson(json));

  if (!parsed.success) {
    return { ok: false, error: "La IA no devolvio conceptos validos. Prueba con mas datos o fotos del proyecto." };
  }

  const createdItems = await insertGeneratedBudgetItems(supabase, projectId.data, parsed.data.items);

  if (!createdItems.ok) {
    return { ok: false, error: createdItems.error };
  }

  await supabase
    .from("projects")
    .update({ status: "Presupuestado", last_activity_at: new Date().toISOString() })
    .eq("id", projectId.data);

  revalidatePath(`/projects/${projectId.data}`);
  revalidatePath("/dashboard");
  return { ok: true, items: createdItems.items };
}

export async function updateBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const itemId = z.string().uuid().parse(formData.get("item_id"));
  const parsed = budgetItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return;
  }

  const { error } = await supabase
    .from("budget_items")
    .update({
      concept: parsed.data.concept,
      notes: parsed.data.notes || null,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      unit_price: parsed.data.unit_price,
    })
    .eq("id", itemId)
    .eq("project_id", parsed.data.project_id);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", parsed.data.project_id);

  revalidatePath(`/projects/${parsed.data.project_id}`);
  revalidatePath("/dashboard");
}

export async function reorderBudgetItemsAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const itemIds = z.array(z.string().uuid()).parse(JSON.parse(String(formData.get("item_ids") ?? "[]")));

  const updates = await Promise.all(
    itemIds.map((itemId, index) =>
      supabase
        .from("budget_items")
        .update({ sort_order: index + 1 })
        .eq("id", itemId)
        .eq("project_id", projectId),
    ),
  );
  const error = updates.find((result) => result.error)?.error;

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function deleteBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const itemId = z.string().uuid().parse(formData.get("item_id"));

  const { error } = await supabase
    .from("budget_items")
    .delete()
    .eq("id", itemId)
    .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function createBudgetItemsFromRoomsAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .returns<Room[]>();

  const { data: modules, error: modulesError } = await supabase
    .from("room_modules")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .returns<RoomModule[]>();

  if (roomsError) {
    throw new Error(roomsError.message);
  }

  const roomModules = isOptionalRoomModulesError(modulesError) ? [] : (modules ?? []);
  if (modulesError && !isOptionalRoomModulesError(modulesError)) {
    throw new Error(modulesError.message);
  }

  const modulesByRoom = new Map<string, RoomModule[]>();
  for (const module of roomModules) {
    modulesByRoom.set(module.room_id, [...(modulesByRoom.get(module.room_id) ?? []), module]);
  }

  const firstSortOrder = await getNextBudgetSortOrder(supabase, projectId);
  const rows = (rooms ?? [])
    .filter((room) => {
      const modulesTotal = (modulesByRoom.get(room.id) ?? []).reduce((sum, module) => sum + Number(module.total), 0);
      return Number(room.total_paintable_area) > 0 || modulesTotal > 0;
    })
    .map((room, index) => ({
      project_id: projectId,
      concept: room.name,
      notes: buildRoomBudgetNotes(room, modulesByRoom.get(room.id) ?? []),
      quantity: 1,
      unit: "",
      unit_price: getRoomBudgetTotal(room, modulesByRoom.get(room.id) ?? []),
      sort_order: firstSortOrder + index,
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await insertBudgetRows(supabase, rows);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ status: "Presupuestado", last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

function getRoomBudgetTotal(room: Room, modules: RoomModule[]) {
  const baseTotal = Number(room.total_paintable_area) * Number(room.unit_price ?? 0);
  const modulesTotal = modules.reduce((sum, module) => sum + Number(module.total), 0);
  return baseTotal + modulesTotal;
}

function buildRoomBudgetNotes(room: Room, modules: RoomModule[]) {
  const baseLabel =
    room.paint_scope === "manual_area"
      ? "Metro cuadrado"
      : room.paint_scope === "ceiling_only"
        ? "Solo techo"
        : room.paint_scope === "walls_only"
          ? "Solo paredes"
          : "Techo y paredes";
  const lines =
    Number(room.total_paintable_area) > 0
      ? [
          `${baseLabel}: ${Number(room.total_paintable_area).toFixed(2)} m2 x ${formatCurrency(Number(room.unit_price ?? 0))} = ${formatCurrency(Number(room.total_paintable_area) * Number(room.unit_price ?? 0))}`,
        ]
      : [];

  if (room.notes) {
    lines.push(`Notas de la zona: ${room.notes}`);
  }

  for (const module of modules) {
    const label = module.module_type === "free" ? module.concept : `${getModuleTypeLabel(module.module_type)} - ${module.concept}`;
    const unit = module.unit ? ` ${module.unit}` : "";
    lines.push(`${label}: ${Number(module.quantity)}${unit} x ${formatCurrency(Number(module.unit_price))} = ${formatCurrency(Number(module.total))}`);
    if (module.notes) {
      lines.push(`Notas: ${module.notes}`);
    }
  }

  return lines.join("\n");
}

function getModuleTypeLabel(moduleType: RoomModule["module_type"]) {
  if (moduleType === "ceiling_only") return "Solo techo";
  if (moduleType === "walls_only") return "Solo paredes";
  if (moduleType === "manual_area") return "Metro cuadrado";
  return "Libre";
}

function isOptionalRoomModulesError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501" || error.code === "PGRST205";
}

function normalizeDecimalInput(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(",")) {
    return trimmed.replace(/\./g, "").replace(",", ".");
  }
  return trimmed;
}

async function getNextBudgetSortOrder(supabase: Supabase, projectId: string) {
  const { data } = await supabase
    .from("budget_items")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number | null }>();

  return Number(data?.sort_order ?? 0) + 1;
}

async function insertBudgetRows(supabase: Supabase, rows: Array<Record<string, unknown>>) {
  const createdRows: Array<Record<string, unknown>> = rows.map((row) => ({ created_at: new Date().toISOString(), ...row }));
  const result = await supabase.from("budget_items").insert(createdRows);

  if (result.error?.code === "PGRST204" || result.error?.code === "42703") {
    const rowsWithoutOptionalColumns = createdRows.map(({ sort_order: _sortOrder, notes: _notes, ...row }) => row);
    return supabase.from("budget_items").insert(rowsWithoutOptionalColumns);
  }

  return result;
}

async function getProjectImageSignedUrls(supabase: Supabase, files: ProjectFile[]) {
  const imageFiles = files.filter((file) => file.file_type.startsWith("image/")).slice(0, 8);
  const signedUrls = await Promise.all(
    imageFiles.map(async (file) => {
      const { data } = await supabase.storage.from("project-files").createSignedUrl(file.file_url, 60 * 30);
      return data?.signedUrl ?? null;
    }),
  );

  return signedUrls.filter((url): url is string => Boolean(url));
}

async function getProjectDocumentText(supabase: Supabase, files: ProjectFile[]) {
  const readableFiles = files.filter(isReadableTextFile).slice(0, 8);
  const textParts: string[] = [];

  for (const file of readableFiles) {
    const { data, error } = await supabase.storage.from("project-files").download(file.file_url);
    if (error || !data) continue;

    const bytes = new Uint8Array(await data.arrayBuffer());
    const text = cleanExtractedText(extractTextFromProjectFile(file, bytes));
    if (!text) continue;

    textParts.push(`Archivo: ${file.file_name}\n${truncateText(text, MAX_AI_FILE_CHARS)}`);
  }

  return truncateText(textParts.join("\n\n"), MAX_AI_DOCUMENT_CHARS);
}

function isReadableTextFile(file: ProjectFile) {
  const fileName = file.file_name.toLowerCase();
  const fileType = file.file_type.toLowerCase();

  return (
    fileType.startsWith("text/") ||
    fileType === "application/pdf" ||
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".docx")
  );
}

function extractTextFromProjectFile(file: ProjectFile, bytes: Uint8Array) {
  const fileName = file.file_name.toLowerCase();
  const fileType = file.file_type.toLowerCase();

  if (fileType.startsWith("text/") || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return decodeUtf8(bytes);
  }

  if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileName.endsWith(".docx")) {
    return extractDocxText(bytes);
  }

  if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
    return extractPdfText(bytes);
  }

  return "";
}

function extractDocxText(bytes: Uint8Array) {
  const entries = readZipEntries(bytes);
  const xmlFiles = entries.filter((entry) =>
    entry.name === "word/document.xml" ||
    entry.name.startsWith("word/header") ||
    entry.name.startsWith("word/footer") ||
    entry.name === "word/comments.xml",
  );

  return xmlFiles.map((entry) => extractTextFromDocxXml(decodeUtf8(entry.content))).join("\n");
}

function readZipEntries(bytes: Uint8Array) {
  const entries: Array<{ name: string; content: Uint8Array }> = [];
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) return entries;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end && view.getUint32(offset, true) === 0x02014b50) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileNameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
    const name = decodeUtf8(fileNameBytes);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.push({ name, content: compressed });
    } else if (method === 8) {
      try {
        entries.push({ name, content: new Uint8Array(inflateRawSync(compressed)) });
      } catch {
        // Ignore entries that cannot be decompressed.
      }
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
      return index;
    }
  }
  return -1;
}

function extractTextFromDocxXml(xml: string) {
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [xml];
  const lines = paragraphs
    .map((paragraph) => {
      const runs = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1]));
      return runs.join("");
    })
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.join("\n");
}

function extractPdfText(bytes: Uint8Array) {
  const latinText = decodeLatin1(bytes);
  const streamText = [...latinText.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      const rawBytes = latin1StringToBytes(match[1]);
      const streamStart = Math.max(0, (match.index ?? 0) - 260);
      const dictionary = latinText.slice(streamStart, match.index ?? 0);

      if (dictionary.includes("/FlateDecode")) {
        try {
          return decodeLatin1(new Uint8Array(inflateRawSync(rawBytes)));
        } catch {
          return "";
        }
      }

      return decodeLatin1(rawBytes);
    })
    .join("\n");

  return [extractPdfTextOperators(streamText), extractPdfTextOperators(latinText)].filter(Boolean).join("\n");
}

function extractPdfTextOperators(content: string) {
  const fragments: string[] = [];

  for (const match of content.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)) {
    fragments.push(decodePdfLiteral(match[0].replace(/\s*Tj$/, "")));
  }

  for (const match of content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
    const arrayContent = match[1];
    const parts = [...arrayContent.matchAll(/\((?:\\.|[^\\()])*\)/g)].map((part) => decodePdfLiteral(part[0]));
    if (parts.length) fragments.push(parts.join(""));
  }

  return fragments.join(" ");
}

function decodePdfLiteral(value: string) {
  const body = value.startsWith("(") && value.endsWith(")") ? value.slice(1, -1) : value;
  return body
    .replace(/\\([nrtbf()\\])/g, (_match, code: string) => {
      if (code === "n") return "\n";
      if (code === "r") return "\r";
      if (code === "t") return "\t";
      if (code === "b") return "\b";
      if (code === "f") return "\f";
      return code;
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\\r?\n/g, "");
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeLatin1(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

function latin1StringToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function cleanExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[Texto recortado por longitud]`;
}

function buildAIBudgetPrompt(project: Project, files: ProjectFile[], documentText: string) {
  const fileSummary = files.length
    ? files.map((file) => `- ${file.file_name} (${file.file_type})`).join("\n")
    : "No hay archivos subidos.";

  return `
Genera lineas normales de presupuesto para esta obra de Decoralia Pintores.

Datos de la obra:
- Nombre: ${project.name}
- Tipo: ${project.project_type}
- Cliente: ${project.client_name}
- Direccion: ${project.address}
- Descripcion: ${project.description || "Sin descripcion"}
- Notas internas: ${project.internal_notes || "Sin notas internas"}

Archivos disponibles:
${fileSummary}

Texto extraido de documentos, PDFs o notas:
${documentText || "No se pudo extraer texto adicional."}

Reglas:
- Devuelve solo JSON con esta forma exacta: {"items":[{"concept":"...","notes":"...","quantity":1,"unit":"","unit_price":260}]}
- Cada item debe ser una card editable del presupuesto.
- Si no hay medidas claras, usa precio cerrado con quantity 1, unit "" y unit_price con el precio final sin IVA.
- Si hay medidas claras, puedes usar unit "m2", "ud" u otra unidad corta.
- No calcules IVA, todos los precios son sin IVA.
- No inventes medidas exactas si no aparecen en la informacion; explica dudas o supuestos en notes.
- Conceptos y notas en espanol, con tono profesional para cliente.
- Maximo 5 lineas, agrupadas de forma practica para poder editarlas despues.
`.trim();
}

function parseAIJson(content: unknown) {
  if (typeof content !== "string") return null;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/) ?? content.match(/\[[\s\S]*\]/);
    if (!match) return { items: buildFallbackBudgetItemsFromText(content) };
    try {
      return JSON.parse(match[0]);
    } catch {
      return { items: buildFallbackBudgetItemsFromText(content) };
    }
  }
}

function normalizeAIBudgetJson(value: unknown) {
  const rawItems = getAIBudgetItems(value);
  return {
    items: rawItems.map(normalizeAIBudgetItem).filter((item) => item.concept && item.unit_price >= 0).slice(0, 8),
  };
}

function getAIBudgetItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];

  const directKeys = ["items", "concepts", "conceptos", "lineas", "líneas", "budget_items", "partidas", "presupuesto"];
  for (const key of directKeys) {
    const maybeItems = value[key];
    if (Array.isArray(maybeItems)) return maybeItems;
  }

  const firstArray = Object.values(value).find((entry) => Array.isArray(entry));
  if (Array.isArray(firstArray)) return firstArray;

  if (getFirstString(value, ["concept", "concepto", "title", "titulo", "nombre", "partida"])) {
    return [value];
  }

  return [];
}

function normalizeAIBudgetItem(value: unknown) {
  if (!isRecord(value)) {
    return {
      concept: String(value ?? "").trim().slice(0, 140),
      notes: null,
      quantity: 1,
      unit: "",
      unit_price: 0,
    };
  }

  const concept =
    getFirstString(value, ["concept", "concepto", "title", "titulo", "nombre", "partida", "descripcion_corta"]) ||
    "Concepto generado con IA";
  const notes = getFirstString(value, ["notes", "notas", "detail", "details", "detalle", "descripcion", "description", "trabajos"]);
  const quantity = parseFlexibleNumber(getFirstValue(value, ["quantity", "cantidad", "qty", "unidades", "metros"]), 1);
  const unit = getFirstString(value, ["unit", "unidad", "tipo_unidad"]) ?? "";
  const rawUnitPrice = getFirstValue(value, ["unit_price", "precio_unitario", "precio", "precio_m2", "€/m2", "eur_m2"]);
  const rawTotal = getFirstValue(value, ["total", "importe", "amount", "precio_total", "subtotal"]);
  const unitPrice = parseFlexibleNumber(rawUnitPrice, Number.NaN);
  const total = parseFlexibleNumber(rawTotal, Number.NaN);
  const resolvedUnitPrice = Number.isFinite(unitPrice)
    ? unitPrice
    : Number.isFinite(total)
      ? total / Math.max(quantity, 1)
      : 0;

  return {
    concept: concept.slice(0, 140),
    notes: notes ? notes.slice(0, 1800) : null,
    quantity,
    unit: unit.slice(0, 20),
    unit_price: Math.max(0, resolvedUnitPrice),
  };
}

function buildFallbackBudgetItemsFromText(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const priceMatch = line.match(/(\d+(?:[.,]\d{1,2})?)\s*€/);
      if (!priceMatch) return null;
      return {
        concept: line.replace(priceMatch[0], "").replace(/^[-*\d.)\s]+/, "").trim().slice(0, 140) || "Concepto generado con IA",
        notes: line,
        quantity: 1,
        unit: "",
        unit_price: parseFlexibleNumber(priceMatch[1], 0),
      };
    })
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFirstValue(value: Record<string, unknown>, keys: string[]) {
  const normalizedEntries = new Map(Object.entries(value).map(([key, entry]) => [normalizeKey(key), entry]));
  for (const key of keys) {
    const entry = normalizedEntries.get(normalizeKey(key));
    if (entry !== undefined && entry !== null && entry !== "") return entry;
  }
  return undefined;
}

function getFirstString(value: Record<string, unknown>, keys: string[]) {
  const entry = getFirstValue(value, keys);
  if (Array.isArray(entry)) return entry.map((item) => String(item)).join("\n").trim();
  if (entry === undefined || entry === null) return null;
  return String(entry).trim() || null;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseFlexibleNumber(value: unknown, fallback: number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (value === undefined || value === null || value === "") return fallback;

  let normalized = String(value).trim().replace(/[^\d,.-]/g, "");
  if (!normalized) return fallback;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  const parts = normalized.split(".");
  if (parts.length > 2) {
    normalized = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function insertGeneratedBudgetItems(supabase: Supabase, projectId: string, generatedItems: GeneratedBudgetItem[]) {
  const firstSortOrder = await getNextBudgetSortOrder(supabase, projectId);
  const createdAt = new Date().toISOString();
  const rows = generatedItems.map((item, index) => ({
    id: crypto.randomUUID(),
    project_id: projectId,
    concept: item.concept,
    notes: item.notes || null,
    quantity: item.quantity,
    unit: item.unit ?? "",
    unit_price: item.unit_price,
    sort_order: firstSortOrder + index,
    created_at: createdAt,
  }));

  const { error } = await insertBudgetRows(supabase, rows);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  const items: BudgetItem[] = rows.map((row) => ({
    id: row.id,
    project_id: row.project_id,
    concept: row.concept,
    notes: row.notes,
    quantity: row.quantity,
    unit: row.unit,
    unit_price: row.unit_price,
    total: Math.round(row.quantity * row.unit_price * 100) / 100,
    sort_order: row.sort_order,
    created_at: row.created_at,
  }));

  return { ok: true as const, items };
}
