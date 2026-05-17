"use client";

import { useState } from "react";
import { BudgetBuilder } from "@/components/BudgetBuilder";
import { ClientCard } from "@/components/ClientCard";
import { FileUploader } from "@/components/FileUploader";
import { ProjectChat } from "@/components/ProjectChat";
import { ProjectEditForm } from "@/components/ProjectEditForm";
import { ProjectFinancePanel } from "@/components/ProjectFinancePanel";
import { RoomCalculator } from "@/components/RoomCalculator";
import { formatCurrency } from "@/lib/calculations";
import type { BudgetItem, Message, Profile, Project, ProjectExpense, ProjectFile, ProjectPayment, Room } from "@/lib/types";

type ProjectTabsProps = {
  project: Project;
  profile: Profile;
  messages: Message[];
  files: ProjectFile[];
  rooms: Room[];
  budgetItems: BudgetItem[];
  expenses: ProjectExpense[];
  payments: ProjectPayment[];
};

const TABS = ["Resumen", "Chat", "Archivos", "Cliente", "Medidas", "Presupuesto", "Gastos"] as const;
type Tab = (typeof TABS)[number];

export function ProjectTabs({
  project,
  profile,
  messages,
  files,
  rooms,
  budgetItems,
  expenses,
  payments,
}: ProjectTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Resumen");
  const [isEditingProject, setIsEditingProject] = useState(false);
  const budgetTotal = budgetItems.reduce((sum, item) => sum + Number(item.total), 0);

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
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-steel">{project.status}</span>
                <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-moss">{project.project_type ?? "Pintura"}</span>
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
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-paper p-4">
                    <p className="text-xs font-black uppercase text-muted">Cliente</p>
                    <h3 className="mt-1 text-xl font-black text-ink">{project.client_name}</h3>
                    <p className="mt-1 text-sm font-black text-moss">{project.project_type ?? "Pintura"}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{project.address}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{project.client_phone}</p>
                    {project.client_email ? <p className="mt-2 text-sm leading-6 text-muted">{project.client_email}</p> : null}
                  </div>
                  <div className="rounded-lg bg-paper p-4">
                    <p className="text-xs font-black uppercase text-muted">Presupuesto estimado</p>
                    <h3 className="mt-1 text-2xl font-black text-ink">{formatCurrency(budgetTotal)}</h3>
                    <p className="mt-2 text-sm font-bold text-muted">IVA no incluido</p>
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

        {activeTab === "Chat" ? (
          <ProjectChat
            projectId={project.id}
            currentUserId={profile.user_id}
            currentUserName={profile.name}
            initialMessages={messages}
          />
        ) : null}
        {activeTab === "Archivos" ? <FileUploader projectId={project.id} files={files} /> : null}
        {activeTab === "Cliente" ? <ClientCard project={project} /> : null}
        {activeTab === "Medidas" ? <RoomCalculator projectId={project.id} rooms={rooms} /> : null}
        {activeTab === "Presupuesto" ? <BudgetBuilder projectId={project.id} items={budgetItems} rooms={rooms} /> : null}
        {activeTab === "Gastos" ? <ProjectFinancePanel projectId={project.id} budgetTotal={budgetTotal} expenses={expenses} payments={payments} /> : null}
      </div>
    </div>
  );
}
