"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { sendSmtpEmail } from "@/lib/smtp";

const emailSchema = z.object({
  project_id: z.preprocess((value) => (value === "" || value === null ? null : value), z.string().uuid().nullable()),
  to_email: z.string().trim().email(),
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(6000),
});

export async function sendDecoraliaEmailAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { ok: false, message: "Revisa el email, asunto y mensaje." };
  }

  const html = buildEmailHtml(parsed.data.body, getLogoUrl());
  const text = buildEmailText(parsed.data.body);

  try {
    await sendSmtpEmail({
      to: parsed.data.to_email,
      subject: parsed.data.subject,
      text,
      html,
    });

    await saveEmailLog(supabase, {
      ...parsed.data,
      status: "sent",
      error_message: null,
      sent_by: user.id,
    });

    revalidatePath("/emails");
    return { ok: true, message: "Correo enviado correctamente." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el correo.";

    await saveEmailLog(supabase, {
      ...parsed.data,
      status: "failed",
      error_message: message,
      sent_by: user.id,
    });

    revalidatePath("/emails");
    return { ok: false, message };
  }
}

async function saveEmailLog(
  supabase: Awaited<ReturnType<typeof requireUserProfile>>["supabase"],
  row: {
    project_id: string | null;
    to_email: string;
    subject: string;
    body: string;
    status: "sent" | "failed";
    error_message: string | null;
    sent_by: string;
  },
) {
  const { error } = await supabase.from("sent_emails").insert(row);

  if (error && error.code !== "42P01") {
    throw new Error(error.message);
  }
}

function buildEmailText(body: string) {
  return `${body}

--
Decoralia Pintores
info@decoraliapintores.es
`;
}

function buildEmailHtml(body: string, logoUrl: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 14px;line-height:1.55;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7f4;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1f2a2b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d9e0db;border-radius:10px;overflow:hidden;">
      <tr>
        <td style="padding:26px 28px 16px;border-bottom:1px solid #d9e0db;">
          <img src="${logoUrl}" alt="Decoralia Pintores" style="display:block;max-width:360px;width:100%;height:auto;" />
        </td>
      </tr>
      <tr>
        <td style="padding:28px;font-size:15px;">
          ${paragraphs}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;background:#225c50;color:#ffffff;">
          <strong style="display:block;font-size:16px;">Decoralia Pintores</strong>
          <span style="display:block;margin-top:6px;font-size:13px;color:#dcebe6;">Pintura, lacados y decoracion profesional</span>
          <span style="display:block;margin-top:10px;font-size:13px;">info@decoraliapintores.es</span>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function getLogoUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const baseUrl = (configuredUrl || vercelUrl || "https://decoraliapintores.es").replace(/\/$/, "");

  return `${baseUrl}/decoralia-logo.png`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
