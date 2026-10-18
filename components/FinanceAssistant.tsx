"use client";
import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { askFinanceAssistant } from "@/actions/financeAssistantActions";
import { useAsyncTask } from "@/lib/useAsyncTask";
type Message = { role: "user" | "assistant"; content: string };
export function FinanceAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [sources, setSources] = useState<
    { dataset: string; count: number; complete: boolean }[]
  >([]);
  const [pending, run] = useAsyncTask();
  return (
    <details className="rounded-lg border border-line bg-white p-4">
      <summary className="flex min-h-12 cursor-pointer items-center gap-3 text-lg font-bold">
        <MessageSquare size={22} className="text-moss" />
        Consultar con IA
      </summary>
      <div className="mt-4 space-y-4">
        <div
          role="log"
          aria-live="polite"
          className="max-h-96 space-y-3 overflow-y-auto"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words rounded-lg p-3 ${m.role === "user" ? "bg-paper" : "border-l-4 border-moss bg-emerald-50"}`}
            >
              <strong className="mb-1 block text-sm">
                {m.role === "user" ? "Tu" : "Decoralia IA"}
              </strong>
              {m.content}
            </div>
          ))}
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const text = question.trim();
            if (!text) return;
            void run(async () => {
              setError("");
              setSources([]);
              const history = [
                ...messages.slice(-6),
                { role: "user" as const, content: text },
              ];
              try {
                const result = await askFinanceAssistant(history);
                if (result.error) throw new Error(result.error);
                if (result.answer) {
                  setMessages([
                    ...history,
                    {
                      role: "assistant",
                      content: result.answer.slice(0, 3000),
                    },
                  ]);
                  setQuestion("");
                  setSources(result.sources ?? []);
                }
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "No se pudo consultar.",
                );
              }
            });
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="form-label">Tu pregunta</span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={2000}
              required
              className="form-input min-h-24"
              placeholder="Cuanto hemos cobrado y gastado este mes?"
            />
          </label>
          <button
            disabled={pending}
            className="inline-flex min-h-12 items-center justify-center gap-2 self-end rounded-lg bg-moss px-5 py-3 font-bold text-white"
          >
            <Send size={18} />
            {pending ? "Consultando..." : "Consultar"}
          </button>
        </form>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {sources.length > 0 && (
          <p className="text-xs text-muted">
            Datos consultados:{" "}
            {sources
              .map(
                (s) =>
                  `${s.dataset}: ${s.count} registros${s.complete ? "" : " (incompleto)"}`,
              )
              .join("; ")}
          </p>
        )}
      </div>
    </details>
  );
}
