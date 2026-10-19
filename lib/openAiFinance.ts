type Output = {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string }[];
};
export type AIResponse = {
  status?: string;
  output?: Output[];
  model?: string;
  notice?: string;
};
export async function financeAI(
  body: Record<string, unknown>,
  timeoutMs = 40000,
): Promise<AIResponse> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Falta configurar OPENAI_API_KEY en el servidor.");
  const primary =
    process.env.OPENAI_FINANCE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-6-astra";
  const fallback =
    process.env.OPENAI_FINANCE_FALLBACK_MODEL?.trim() || "gpt-4o";
  const models = primary === fallback ? [primary] : [primary, fallback];
  const deadline = Date.now() + timeoutMs;
  for (const [attempt, model] of models.entries()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error("La consulta tarda demasiado. Intentalo de nuevo.");
    const reasoningModel = /^gpt-6(?:[.-]|$)/.test(model);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(Math.max(1, remaining)),
      body: JSON.stringify({
        max_output_tokens: reasoningModel ? 8192 : 2400,
        ...(reasoningModel
          ? {
              reasoning: { effort: "low" },
              include: ["reasoning.encrypted_content"],
            }
          : {}),
        ...body,
        ...(attempt > 0 && !reasoningModel && Array.isArray(body.input)
          ? { input: body.input.filter((item) => item?.type !== "reasoning") }
          : {}),
        model,
        store: false,
      }),
    });
    if (!response.ok) {
      let code = "";
      try {
        code = (await response.json())?.error?.code ?? "";
      } catch {
        /* Non-JSON provider errors remain recoverable. */
      }
      // Only unavailable models trigger fallback, never quota or invalid-data errors.
      const unavailable =
        [400, 403, 404].includes(response.status) &&
        [
          "model_not_found",
          "model_not_available",
          "model_access_denied",
          "unsupported_model",
        ].includes(code);
      if (attempt === 0 && unavailable && models.length > 1) continue;
      throw new Error(
        response.status === 429
          ? "OpenAI ha alcanzado su limite. Prueba dentro de un momento."
          : unavailable
            ? "Tu cuenta de OpenAI no tiene acceso al modelo configurado ni a su respaldo. Revisa los permisos de la API."
            : "OpenAI no pudo procesar la solicitud. Revisa la configuracion del modelo.",
      );
    }
    const result = (await response.json()) as AIResponse;
    if (result.status === "incomplete")
      throw new Error("La respuesta quedo incompleta. Intentalo otra vez.");
    return {
      ...result,
      model: result.model ?? model,
      ...(attempt > 0
        ? {
            notice: `OpenAI no ha permitido usar ${primary}. Se ha utilizado ${model} como respaldo.`,
          }
        : {}),
    };
  }
  throw new Error("No se pudo seleccionar un modelo disponible.");
}
export function aiText(response: AIResponse) {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("\n");
}
