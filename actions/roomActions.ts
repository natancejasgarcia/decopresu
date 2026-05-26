"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const roomSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(2),
  length: z.coerce.number().min(0).default(0),
  width: z.coerce.number().min(0).default(0),
  height: z.coerce.number().min(0).default(0),
  openings_area: z.coerce.number().min(0).default(0),
  manual_area: z.coerce.number().min(0).default(0),
  paint_scope: z.enum(["walls_and_ceiling", "ceiling_only", "walls_only", "manual_area"]).default("walls_and_ceiling"),
  unit_price: z.coerce.number().min(0).default(6),
  notes: z.string().trim().optional(),
});

const roomModuleSchema = z.object({
  project_id: z.string().uuid(),
  room_id: z.string().uuid(),
  module_type: z.enum(["ceiling_only", "walls_only", "manual_area", "free"]).default("free"),
  concept: z.string().trim().min(2),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().default("m2"),
  unit_price: z.coerce.number().min(0),
  notes: z.string().trim().optional(),
});

function normalizeRoomInput(parsed: z.infer<typeof roomSchema>) {
  if (parsed.paint_scope === "manual_area") {
    return {
      ...parsed,
      length: 1,
      width: 1,
      height: 1,
      openings_area: 0,
    };
  }

  return {
    ...parsed,
    manual_area: 0,
    openings_area: parsed.paint_scope === "ceiling_only" ? 0 : parsed.openings_area,
  };
}

export async function createRoomAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const parsed = roomSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("rooms").insert({
    ...normalizeRoomInput(parsed),
    notes: parsed.notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", parsed.project_id);

  revalidatePath(`/projects/${parsed.project_id}`);
}

export async function updateRoomAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const roomId = z.string().uuid().parse(formData.get("room_id"));
  const parsed = roomSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase
    .from("rooms")
    .update({
      ...normalizeRoomInput(parsed),
      notes: parsed.notes || null,
    })
    .eq("id", roomId)
    .eq("project_id", parsed.project_id);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", parsed.project_id);

  revalidatePath(`/projects/${parsed.project_id}`);
}

export async function deleteRoomAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const roomId = z.string().uuid().parse(formData.get("room_id"));

  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", roomId)
    .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
}

export async function createRoomModuleAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = roomModuleSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("room_modules").insert({
    ...parsed,
    unit: parsed.unit || "m2",
    notes: parsed.notes || null,
    created_by: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await touchProject(supabase, parsed.project_id);
  revalidatePath(`/projects/${parsed.project_id}`);
}

export async function updateRoomModuleAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const moduleId = z.string().uuid().parse(formData.get("module_id"));
  const parsed = roomModuleSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase
    .from("room_modules")
    .update({
      module_type: parsed.module_type,
      concept: parsed.concept,
      quantity: parsed.quantity,
      unit: parsed.unit || "m2",
      unit_price: parsed.unit_price,
      notes: parsed.notes || null,
    })
    .eq("id", moduleId)
    .eq("project_id", parsed.project_id)
    .eq("room_id", parsed.room_id);

  if (error) {
    throw new Error(error.message);
  }

  await touchProject(supabase, parsed.project_id);
  revalidatePath(`/projects/${parsed.project_id}`);
}

export async function deleteRoomModuleAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const roomId = z.string().uuid().parse(formData.get("room_id"));
  const moduleId = z.string().uuid().parse(formData.get("module_id"));

  const { error } = await supabase
    .from("room_modules")
    .delete()
    .eq("id", moduleId)
    .eq("project_id", projectId)
    .eq("room_id", roomId);

  if (error) {
    throw new Error(error.message);
  }

  await touchProject(supabase, projectId);
  revalidatePath(`/projects/${projectId}`);
}

async function touchProject(
  supabase: Awaited<ReturnType<typeof requireUserProfile>>["supabase"],
  projectId: string,
) {
  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);
}
