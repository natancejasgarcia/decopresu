"use client";

import { Copy, MessageCircle, Phone } from "lucide-react";
import type { Project } from "@/lib/types";

type ClientCardProps = {
  project: Project;
};

export function ClientCard({ project }: ClientCardProps) {
  const phoneForWhatsapp = project.client_phone.replace(/[^\d]/g, "");

  return (
    <section className="section-panel">
      <div className="section-heading">
        <h2>Cliente</h2>
      </div>
      <div className="grid gap-2 text-sm text-muted">
        <p><strong className="text-ink">{project.client_name}</strong></p>
        <p>{project.client_phone}</p>
        {project.client_email ? <p>{project.client_email}</p> : null}
        <p>{project.address}</p>
        {project.internal_notes ? <p className="rounded-lg bg-paper p-3">{project.internal_notes}</p> : null}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <a className="quick-button" href={`tel:${project.client_phone}`}>
          <Phone size={17} />
          Llamar
        </a>
        <a className="quick-button" href={`https://wa.me/${phoneForWhatsapp}`} target="_blank" rel="noreferrer">
          <MessageCircle size={17} />
          WhatsApp
        </a>
        <button className="quick-button" type="button" onClick={() => navigator.clipboard.writeText(project.client_phone)}>
          <Copy size={17} />
          Copiar
        </button>
      </div>
    </section>
  );
}
