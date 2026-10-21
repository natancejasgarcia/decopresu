import { NextResponse, type NextRequest } from "next/server";
import { isRedirectError, getURLFromRedirectError } from "next/dist/client/components/redirect";
import { saveCompanyAction } from "@/actions/salesActions";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const origin = request.headers.get("origin");
  if (origin) {
    // Next.js may use an internal hostname in nextUrl; compare the public request host.
    try {
      const source = new URL(origin);
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (!["http:", "https:"].includes(source.protocol) || source.host !== host.toLowerCase()) {
        return json({ ok: false, error: "Solicitud no autorizada." }, 403);
      }
    } catch {
      return json({ ok: false, error: "Solicitud no autorizada." }, 403);
    }
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ ok: false, error: "Formato de solicitud no valido." }, 415);
  }
  if (Number(request.headers.get("content-length")) > 16384) {
    return json({ ok: false, error: "Los datos enviados son demasiado largos." }, 413);
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, error: "No se pudieron leer los datos de empresa." }, 400);
  }
  try {
    const result = await saveCompanyAction(input);
    return json(result, result.ok ? 200 : 422);
  } catch (error) {
    if (isRedirectError(error)) {
      const expired = getURLFromRedirectError(error).startsWith("/login");
      return json({ ok: false, error: expired ? "Inicia sesion para guardar los datos de empresa." : "Tu usuario no tiene acceso a los datos de empresa." }, expired ? 401 : 403);
    }
    console.error("[Decoralia company settings] Save failed");
    return json({ ok: false, error: "No se pudo confirmar el guardado. Tus datos siguen en pantalla; vuelve a intentarlo." }, 503);
  }
}
