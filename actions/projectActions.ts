"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { PROJECT_STATUSES, PROJECT_TYPES } from "@/lib/types";
import type { BudgetItem, Project, Room, RoomModule } from "@/lib/types";

const projectSchema = z.object({
  name: z.string().trim().min(2, "El proyecto necesita un nombre."),
  client_name: z.string().trim().min(2, "Indica el nombre del cliente."),
  client_phone: z.string().trim().min(6, "Indica un telefono valido."),
  client_email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().min(3, "Indica la direccion."),
  description: z.string().trim().min(3, "Describe el trabajo."),
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]),
  project_type: z.enum(PROJECT_TYPES as [string, ...string[]]).default("Pintura"),
  internal_notes: z.string().trim().optional(),
});

export async function createProjectAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...parsed.data,
      client_email: parsed.data.client_email || null,
      internal_notes: parsed.data.internal_notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo crear el proyecto.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProjectStatusAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const status = z.enum(PROJECT_STATUSES as [string, ...string[]]).parse(formData.get("status"));

  const { error } = await supabase
    .from("projects")
    .update({ status, last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/projects");
}

export async function updateProjectAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return;
  }

  const { error } = await supabase
    .from("projects")
    .update({
      ...parsed.data,
      client_email: parsed.data.client_email || null,
      internal_notes: parsed.data.internal_notes || null,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/projects");
}

export async function cloneProjectAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single<Project>();

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "No se pudo encontrar la obra para clonar.");
  }

  const [
    { data: rooms, error: roomsError },
    { data: roomModules, error: roomModulesError },
    { data: budgetItems, error: budgetItemsError },
  ] = await Promise.all([
    supabase.from("rooms").select("*").eq("project_id", projectId).order("created_at", { ascending: true }).returns<Room[]>(),
    supabase.from("room_modules").select("*").eq("project_id", projectId).order("created_at", { ascending: true }).returns<RoomModule[]>(),
    supabase.from("budget_items").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }).returns<BudgetItem[]>(),
  ]);

  if (roomsError || (!isOptionalCloneTableError(roomModulesError) && roomModulesError) || budgetItemsError) {
    throw new Error(roomsError?.message ?? roomModulesError?.message ?? budgetItemsError?.message ?? "No se pudo clonar la obra.");
  }

  const { data: clonedProject, error: cloneError } = await supabase
    .from("projects")
    .insert({
      name: `Copia de ${project.name}`.slice(0, 160),
      client_name: project.client_name,
      client_phone: project.client_phone,
      client_email: project.client_email,
      address: project.address,
      description: project.description,
      status: "Pendiente",
      project_type: project.project_type ?? "Pintura",
      internal_notes: project.internal_notes,
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (cloneError || !clonedProject) {
    throw new Error(cloneError?.message ?? "No se pudo crear la copia.");
  }

  const roomIdMap = new Map<string, string>();
  const clonedRooms = (rooms ?? []).map((room) => {
    const clonedRoomId = crypto.randomUUID();
    roomIdMap.set(room.id, clonedRoomId);

    return {
      id: clonedRoomId,
      project_id: clonedProject.id,
      name: room.name,
      length: Number(room.length),
      width: Number(room.width),
      height: Number(room.height),
      openings_area: Number(room.openings_area),
      manual_area: Number(room.manual_area),
      paint_scope: room.paint_scope,
      unit_price: Number(room.unit_price),
      notes: room.notes,
    };
  });

  if (clonedRooms.length > 0) {
    const { error: clonedRoomsError } = await supabase.from("rooms").insert(clonedRooms);

    if (clonedRoomsError) {
      throw new Error(clonedRoomsError.message);
    }
  }

  const clonedRoomModules = (isOptionalCloneTableError(roomModulesError) ? [] : roomModules ?? [])
    .map((module) => {
      const clonedRoomId = roomIdMap.get(module.room_id);
      if (!clonedRoomId) return null;

      return {
        project_id: clonedProject.id,
        room_id: clonedRoomId,
        module_type: module.module_type,
        concept: module.concept,
        quantity: Number(module.quantity),
        unit: module.unit,
        unit_price: Number(module.unit_price),
        notes: module.notes,
        created_by: user.id,
      };
    })
    .filter((module): module is NonNullable<typeof module> => Boolean(module));

  if (clonedRoomModules.length > 0) {
    const { error: clonedModulesError } = await supabase.from("room_modules").insert(clonedRoomModules);

    if (clonedModulesError) {
      throw new Error(clonedModulesError.message);
    }
  }

  const clonedBudgetItems = (budgetItems ?? []).map((item) => ({
    project_id: clonedProject.id,
    concept: item.concept,
    notes: item.notes,
    quantity: Number(item.quantity),
    unit: item.unit,
    unit_price: Number(item.unit_price),
    sort_order: Number(item.sort_order ?? 0),
  }));

  if (clonedBudgetItems.length > 0) {
    const { error: clonedBudgetItemsError } = await supabase.from("budget_items").insert(clonedBudgetItems);

    if (clonedBudgetItemsError) {
      throw new Error(clonedBudgetItemsError.message);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  redirect(`/projects/${clonedProject.id}`);
}

export async function deleteProjectAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));

  const { data: files, error: filesError } = await supabase
    .from("project_files")
    .select("file_url")
    .eq("project_id", projectId);

  if (filesError) {
    throw new Error(filesError.message);
  }

  const filePaths = (files ?? [])
    .map((file) => String(file.file_url || ""))
    .filter(Boolean);

  if (filePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from("project-files").remove(filePaths);

    if (storageError) {
      throw new Error(storageError.message);
    }
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/projects");
}

function isOptionalCloneTableError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501" || error.code === "PGRST205";
}
