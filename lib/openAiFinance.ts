type Output = {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string }[];
};
export type AIResponse = { status?: string; output?: Output[] };
export async function financeAI(
  body: Record<string, unknown>,
  timeoutMs = 40000,
): Promise<AIResponse> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Falta configurar OPENAI_API_KEY en el servidor.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    body: JSON.stringify({
      model:
        process.env.OPENAI_FINANCE_MODEL ??
        process.env.OPENAI_MODEL ??
        "gpt-4o",
      store: false,
      max_output_tokens: 2400,
      ...body,
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "OpenAI ha alcanzado su limite. Prueba dentro de un momento."
        : "OpenAI no pudo procesar la solicitud. Revisa la configuracion del modelo.",
    );
  const result = (await response.json()) as AIResponse;
  if (result.status === "incomplete")
    throw new Error("La respuesta quedo incompleta. Intentalo otra vez.");
  return result;
}
export function aiText(response: AIResponse) {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("\n");
}
