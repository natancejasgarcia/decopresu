import { companySchema, type CompanySettings } from "@/lib/sales";

type CompanySaveResult =
  | { ok: true; settings: CompanySettings }
  | { ok: false; error: string; requiresLogin?: boolean };

export async function saveCompanySettings(input: CompanySettings): Promise<CompanySaveResult> {
  try {
    const response = await fetch("/settings/company", {
      method: "PUT",
      credentials: "same-origin",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.status === 401) {
      return { ok: false, requiresLogin: true, error: "La sesion ha caducado. Inicia sesion y vuelve a guardar; tus datos siguen aqui." };
    }
    const result = await response.json();
    if (!response.ok || result?.ok !== true) {
      return { ok: false, error: typeof result?.error === "string" ? result.error : "No se pudo guardar. Tus datos siguen en pantalla." };
    }
    const saved = companySchema.safeParse(result.settings);
    if (!saved.success) throw new Error("Unconfirmed company settings");
    return { ok: true, settings: { id: 1, ...saved.data } };
  } catch {
    return { ok: false, error: "No se pudo confirmar el guardado. Comprueba la conexion y vuelve a guardar; tus datos siguen aqui." };
  }
}
