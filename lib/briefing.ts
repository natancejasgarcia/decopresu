import { z } from "zod";

const element = z
  .object({
    id: z.string().min(1).max(100),
    type: z.enum([
      "rectangle",
      "diamond",
      "ellipse",
      "line",
      "arrow",
      "freedraw",
      "text",
      "image",
      "frame",
    ]),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    version: z.number().int().nonnegative(),
    versionNonce: z.number().int(),
    isDeleted: z.boolean(),
    link: z.string().max(2000).nullable().optional(),
  })
  .passthrough();

export const briefingSceneSchema = z
  .object({
    elements: z.array(element).max(5000),
    appState: z.object({
      viewBackgroundColor: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .default("#ffffff"),
    }),
    files: z.record(
      z.object({
        id: z.string().min(1).max(100),
        mimeType: z.enum([
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
        ]),
        dataURL: z
          .string()
          .max(3_000_000)
          .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/),
        created: z.number().finite(),
        lastRetrieved: z.number().finite().optional(),
      }),
    ),
  })
  .superRefine((scene, ctx) => {
    if (JSON.stringify(scene).length > 3_500_000) {
      ctx.addIssue({
        code: "custom",
        message:
          "La pizarra contiene demasiadas fotos. Exporta una copia y reduce las imagenes.",
      });
    }
    const ids = new Set<string>();
    for (const item of scene.elements) {
      if (ids.has(item.id))
        ctx.addIssue({ code: "custom", message: "Elementos duplicados." });
      ids.add(item.id);
    }
  });

export type BriefingScene = z.infer<typeof briefingSceneSchema>;
export type BriefingSnapshot = {
  scene: BriefingScene;
  version: number;
  updated_at: string;
  updated_by: string | null;
};
export type BriefingProject = {
  id: string;
  name: string;
  client_name: string;
  status: string;
  total: number;
};
export const EMPTY_BRIEFING: BriefingScene = {
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

export function briefingFingerprint(scene: BriefingScene) {
  return JSON.stringify([
    scene.elements.map((e) => [e.id, e.version, e.versionNonce, e.isDeleted]),
    scene.appState,
    Object.keys(scene.files).sort(),
  ]);
}

export function isBriefingUnavailable(error: { code?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST202"
  );
}
