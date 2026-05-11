"use client";

import { useState } from "react";
import { BudgetBuilder } from "@/components/BudgetBuilder";
import { ClientCard } from "@/components/ClientCard";
import { FileUploader } from "@/components/FileUploader";
import { ProjectChat } from "@/components/ProjectChat";
import { ProjectEditForm } from "@/components/ProjectEditForm";
import { ProjectTasks } from "@/components/ProjectTasks";
import { RoomCalculator } from "@/components/RoomCalculator";
import { formatCurrency } from "@/lib/calculations";
import type { BudgetItem, Message, Profile, Project, ProjectFile, ProjectTask, Room } from "@/lib/types";

type ProjectTabsProps = {
  project: Project;
  profile: Profile;
  messages: Message[];
  files: ProjectFile[];
  rooms: Room[];
  budgetItems: BudgetItem[];
  tasks: ProjectTask[];
};

const TABS = ["Resumen", "Cliente", "Medidas", "Presupuesto", "Tareas", "Chat", "Archivos"] as const;
type Tab = (typeof TABS)[number];

export function ProjectTabs({
  project,
  profile,
  messages,
  files,
  rooms,
  budgetItems,
  tasks,
}: ProjectTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Resumen");
  const [isEditingProject, setIsEditingProject] = useState(false);
  const budgetTotal = budgetItems.reduce((sum, item) => sum + Number(item.total), 0);
  const roomTotal = rooms.reduce((sum, room) => sum + Number(room.total_paintable_area), 0);
  const openTasks = tasks.filter((task) => !task.is_done);
  const lastMessage = messages.at(-1);

  return (
    <div>
      <div className="sticky top-[65px] z-20 -mx-4 overflow-x-auto border-b border-line bg-paper px-4 py-2 sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex min-w-max gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`h-10 rounded-lg px-3 text-sm font-black ${activeTab === tab ? "bg-moss text-white" : "bg-white text-ink"}`}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "Resumen" ? (
          <section className="section-panel">
            <div className="section-heading">
              <h2>Resumen</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-steel">{project.status}</span>
                <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-moss">{project.project_type ?? "Pintura"}</span>
                <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-clay">{project.priority_tag ?? "Normal"}</span>
                <button
                  className="h-10 rounded-lg border border-line px-3 text-sm font-black text-ink"
                  onClick={() => setIsEditingProject((current) => !current)}
                  type="button"
                >
                  {isEditingProject ? "Cerrar" : "Editar obra"}
                </button>
              </div>
            </div>
            {isEditingProject ? (
              <ProjectEditForm project={project} />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <SummaryCard label="Cliente" value={project.client_name} detail={project.address} />
                  <SummaryCard label="Presupuesto" value={formatCurrency(budgetTotal)} detail="IVA no incluido" />
                  <SummaryCard label="Medidas" value={`${roomTotal.toFixed(2)} m2`} detail={`${rooms.length} zonas medidas`} />
                  <SummaryCard label="Tareas" value={String(openTasks.length)} detail="pendientes" />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-white p-4 ring-1 ring-line">
                    <p className="text-xs font-black uppercase text-muted">Proximo paso</p>
                    <p className="mt-2 text-sm font-black text-ink">{project.next_step || "Sin proximo paso"}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 ring-1 ring-line">
                    <p className="text-xs font-black uppercase text-muted">Agenda</p>
                    <p className="mt-2 text-sm font-semibold text-muted">Visita: {formatOptionalDate(project.visit_date)}</p>
                    <p className="mt-1 text-sm font-semibold text-muted">Inicio: {formatOptionalDate(project.start_date)}</p>
                    <p className="mt-1 text-sm font-semibold text-muted">Fin: {formatOptionalDate(project.end_date)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 ring-1 ring-line">
                    <p className="text-xs font-black uppercase text-muted">Actividad</p>
                    <p className="mt-2 line-clamp-3 text-sm font-semibold text-ink">{lastMessage?.text ?? "Sin mensajes"}</p>
                    <p className="mt-1 text-xs font-bold text-muted">{files.length} archivos subidos</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-line">
                  <p className="text-xs font-black uppercase text-muted">Descripcion</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{project.description}</p>
                </div>
                {project.internal_notes ? (
                  <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-line">
                    <p className="text-xs font-black uppercase text-muted">Notas internas</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{project.internal_notes}</p>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {activeTab === "Cliente" ? <ClientCard project={project} /> : null}
        {activeTab === "Medidas" ? <RoomCalculator projectId={project.id} rooms={rooms} /> : null}
        {activeTab === "Presupuesto" ? <BudgetBuilder projectId={project.id} items={budgetItems} rooms={rooms} /> : null}
        {activeTab === "Tareas" ? <ProjectTasks projectId={project.id} tasks={tasks} /> : null}
        {activeTab === "Chat" ? (
          <ProjectChat
            projectId={project.id}
            currentUserId={profile.user_id}
            currentUserName={profile.name}
            initialMessages={messages}
          />
        ) : null}
        {activeTab === "Archivos" ? <FileUploader projectId={project.id} files={files} /> : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg bg-paper p-4">
      <p className="text-xs font-black uppercase text-muted">{label}</p>
      <h3 className="mt-1 text-xl font-black text-ink">{value}</h3>
      <p className="mt-2 text-sm font-bold text-muted">{detail}</p>
    </div>
  );
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}
