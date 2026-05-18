"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Mail, Send } from "lucide-react";
import { sendDecoraliaEmailAction } from "@/actions/emailActions";
import type { Project } from "@/lib/types";

type EmailComposerProps = {
  projects: Project[];
};

export function EmailComposer({ projects }: EmailComposerProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId), [projects, selectedProjectId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);

    startTransition(async () => {
      const result = await sendDecoraliaEmailAction(formData);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        form.reset();
        setSelectedProjectId("");
      }
    });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
            <Mail size={20} />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-clay">Correos</p>
            <h1 className="text-2xl font-black text-ink">Enviar correo Decoralia</h1>
            <p className="mt-1 text-sm font-semibold text-muted">Sale desde info@decoraliapintores.es con la marca en el footer.</p>
          </div>
        </div>
        <Image src="/decoralia-logo.png" alt="Decoralia Pintores" width={260} height={70} className="h-auto w-48 object-contain sm:w-64" priority />
      </div>

      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="form-label">Proyecto relacionado</span>
            <select className="form-input" name="project_id" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              <option value="">Sin proyecto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name} - {project.client_name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">Para</span>
            <input key={`to-${selectedProjectId}`} className="form-input" name="to_email" type="email" defaultValue={selectedProject?.client_email ?? ""} placeholder="cliente@email.com" required />
          </label>
        </div>

        <label>
          <span className="form-label">Asunto</span>
          <input
            key={`subject-${selectedProjectId}`}
            className="form-input"
            name="subject"
            defaultValue={selectedProject ? `Decoralia - ${selectedProject.name}` : ""}
            placeholder="Presupuesto Decoralia"
            required
          />
        </label>

        <label>
          <span className="form-label">Mensaje</span>
          <textarea
            key={`body-${selectedProjectId}`}
            className="form-input min-h-56"
            name="body"
            defaultValue={selectedProject ? defaultProjectMessage(selectedProject) : defaultMessage()}
            placeholder="Escribe aqui el correo..."
            required
          />
        </label>

        {message ? (
          <div className={`rounded-lg p-3 text-sm font-black ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {message.text}
          </div>
        ) : null}

        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-5 font-black text-white disabled:opacity-60" disabled={isPending}>
          <Send size={18} />
          {isPending ? "Enviando..." : "Enviar correo"}
        </button>
      </form>
    </section>
  );
}

function defaultMessage() {
  return `Hola,

Le escribimos desde Decoralia Pintores.

Quedamos a su disposicion para cualquier duda.

Un saludo,
Decoralia Pintores`;
}

function defaultProjectMessage(project: Project) {
  return `Hola ${project.client_name},

Le escribimos desde Decoralia Pintores sobre la obra "${project.name}".

${project.description}

Quedamos a su disposicion para cualquier duda.

Un saludo,
Decoralia Pintores`;
}
