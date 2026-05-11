"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

export async function dismissTodayItemAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const itemKey = z.string().trim().min(2).max(120).parse(formData.get("item_key"));
  const dismissedOn = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("dashboard_dismissals").upsert(
    {
      user_id: user.id,
      item_key: itemKey,
      dismissed_on: dismissedOn,
    },
    { onConflict: "user_id,item_key,dismissed_on" },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
}
