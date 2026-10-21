"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Mail, Phone, Search } from "lucide-react";
import type { Project } from "@/lib/types";
export function ClientsDirectory({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const clients = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; phone: string; email: string | null; projects: Project[] }
    >();
    for (const project of projects) {
      const key = [
        project.client_name.trim().toLocaleLowerCase("es"),
        project.client_phone.replace(/\D/g, ""),
      ].join(":");
      const row = groups.get(key) ?? {
        name: project.client_name,
        phone: project.client_phone,
        email: project.client_email,
        projects: [],
      };
      row.projects.push(project);
      groups.set(key, row);
    }
    return [...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
  }, [projects]);
  const matches = clients.filter((c) =>
    [c.name, c.phone, c.email ?? ""]
      .join(" ")
      .toLocaleLowerCase("es")
      .includes(query.toLocaleLowerCase("es")),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="mt-1 text-muted">
            {clients.length} clientes de tus obras
          </p>
        </div>
        <Link className="action-primary" href="/projects/new">
          Nueva obra
        </Link>
      </div>
      <label className="block">
        <span className="form-label">Buscar cliente</span>
        <div className="relative">
          <Search size={20} className="absolute left-3 top-4 text-muted" />
          <input
            className="form-input pl-10"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, teléfono o correo"
          />
        </div>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {matches.map((client) => (
          <article
            className="min-w-0 rounded-lg border border-line bg-white p-4"
            key={client.projects[0].id}
          >
            <h2 className="break-words text-xl font-bold">{client.name}</h2>
            <div className="my-4 flex flex-wrap gap-2">
              {client.phone && (
                <a
                  className="action-secondary"
                  href={`tel:${client.phone.replace(/[^+\d]/g, "")}`}
                >
                  <Phone size={18} />
                  {client.phone}
                </a>
              )}
              {client.email && (
                <a
                  className="action-secondary max-w-full break-all"
                  href={`mailto:${client.email}`}
                >
                  <Mail size={18} />
                  Correo
                </a>
              )}
            </div>
            <ul className="divide-y divide-line">
              {client.projects.map((project) => (
                <li key={project.id}>
                  <Link
                    className="flex min-h-14 items-center justify-between gap-3 py-3"
                    href={`/projects/${project.id}`}
                    prefetch={false}
                  >
                    <span className="min-w-0 break-words">
                      <strong>{project.name}</strong>
                      <span className="mt-1 block text-sm text-muted">
                        {project.status}
                      </span>
                    </span>
                    <ArrowRight size={20} className="shrink-0 text-moss" />
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {matches.length === 0 && (
        <p className="py-8 text-muted">No hay clientes con esta búsqueda.</p>
      )}
    </div>
  );
}
