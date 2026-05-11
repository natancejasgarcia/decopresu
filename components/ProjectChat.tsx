"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { markProjectReadAction, sendMessageAction } from "@/actions/messageActions";
import { formatDate } from "@/lib/calculations";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { Message } from "@/lib/types";

type ProjectChatProps = {
  projectId: string;
  currentUserId: string;
  currentUserName: string;
  initialMessages: Message[];
};

export function ProjectChat({
  projectId,
  currentUserId,
  currentUserName,
  initialMessages,
}: ProjectChatProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`project-messages-${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `project_id=eq.${projectId}` },
        async (payload) => {
          const incoming = payload.new as Message;
          setMessages((current) => {
            if (current.some((message) => message.id === incoming.id)) return current;
            return [
              ...current,
              {
                ...incoming,
                user_name: incoming.user_id === currentUserId ? currentUserName : "Decoralia",
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, currentUserName, projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const formData = new FormData();
    formData.set("project_id", projectId);
    void markProjectReadAction(formData);
  }, [messages.length, projectId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return;

    startTransition(async () => {
      await sendMessageAction(formData);
      formRef.current?.reset();
    });
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <h2>Chat</h2>
        <span className="text-xs font-bold text-muted">Tiempo real</span>
      </div>
      <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="rounded-lg bg-paper p-4 text-sm text-muted">Todavia no hay mensajes en este proyecto.</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className="flex items-start gap-3 rounded-lg bg-paper p-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-clay text-sm font-black text-white">
                {(message.user_name ?? "D").slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-ink">
                  {message.user_name ?? "Decoralia"}
                  <span className="ml-2 text-xs font-medium text-muted">{formatDate(message.created_at)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{message.text}</p>
              </div>
            </article>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form ref={formRef} onSubmit={handleSubmit} className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-white p-2">
        <input type="hidden" name="project_id" value={projectId} />
        <input
          className="min-h-11 flex-1 bg-transparent px-2 outline-none"
          name="text"
          placeholder="Escribir mensaje"
          autoComplete="off"
        />
        <button className="grid h-11 w-11 place-items-center rounded-lg bg-moss text-white disabled:opacity-60" disabled={isPending} title="Enviar">
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}
