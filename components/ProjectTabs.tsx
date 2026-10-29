"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  ImagePlus,
  MessageCircle,
  ReceiptText,
  Ruler,
  UserRound,
  WalletCards,
} from "lucide-react";
import { CloneProjectButton } from "@/components/CloneProjectButton";
import { PROJECT_TABS as TABS, projectTabHref, type ProjectTab as Tab } from "@/lib/projectTabs";
import { formatCurrency } from "@/lib/calculations";
import type { BudgetConceptSuggestion } from "@/lib/budgetConcepts";
import type {
  BudgetItem,
  Message,
  Profile,
  Project,
  ProjectExpense,
  ProjectFile,
  ProjectPayment,
  Room,
} from "@/lib/types";

function PanelLoading() {
  return <p className="p-4 text-base font-bold text-moss" role="status">Cargando apartado...</p>;
}

const BudgetBuilder = dynamic(() => import("@/components/BudgetBuilder").then((module) => module.BudgetBuilder), { loading: PanelLoading });
const ClientCard = dynamic(() => import("@/components/ClientCard").then((module) => module.ClientCard), { loading: PanelLoading });
const FileUploader = dynamic(() => import("@/components/FileUploader").then((module) => module.FileUploader), { loading: PanelLoading });
const ProjectChat = dynamic(() => import("@/components/ProjectChat").then((module) => module.ProjectChat), { loading: PanelLoading });
const ProjectEditForm = dynamic(() => import("@/components/ProjectEditForm").then((module) => module.ProjectEditForm), { loading: PanelLoading });
const ProjectFinancePanel = dynamic(() => import("@/components/ProjectFinancePanel").then((module) => module.ProjectFinancePanel), { loading: PanelLoading });
const RoomCalculator = dynamic(() => import("@/components/RoomCalculator").then((module) => module.RoomCalculator), { loading: PanelLoading });

type ProjectTabsProps = {
  activeTab: Tab;
  budgetTotal: number;
  project: Project;
  profile: Profile;
  messages: Message[];
  files: ProjectFile[];
  rooms: Room[];
  budgetItems: BudgetItem[];
  budgetConceptSuggestions?: BudgetConceptSuggestion[];
  expenses: ProjectExpense[];
  payments: ProjectPayment[];
};

const TAB_ICONS = {
  Resumen: FileText,
  Chat: MessageCircle,
  Archivos: ImagePlus,
  Cliente: UserRound,
  Medidas: Ruler,
  Presupuesto: ReceiptText,
  Gastos: WalletCards,
} satisfies Record<Tab, typeof FileText>;

export function ProjectTabs({
  activeTab,
  budgetTotal,
  project,
  profile,
  messages,
  files,
  rooms,
  budgetItems,
  budgetConceptSuggestions,
  expenses,
  payments,
}: ProjectTabsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [requestedTab, setRequestedTab] = useState<Tab>(activeTab);
  const [isEditingProject, setIsEditingProject] = useState(false);

  function openTab(tab: Tab) {
    if (tab === activeTab || isPending) return;
    setRequestedTab(tab);
    setIsEditingProject(false);
    startTransition(() => router.push(projectTabHref(project.id, tab), { scroll: false }));
  }

  return (
    <div>
      <div className="sticky top-[65px] z-20 -mx-4 border-b border-line bg-paper px-3 py-2 sm:mx-0 sm:rounded-lg sm:border sm:px-4">
        <div
          className="grid grid-cols-3 gap-2 md:grid-cols-5 xl:grid-cols-9"
          role="tablist"
          aria-label="Secciones de la obra"
        >
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];

            return (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                tabIndex={activeTab === tab ? 0 : -1}
                aria-controls="project-panel"
                id={`project-tab-${tab}`}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-lg px-2 text-sm font-bold leading-tight ${
                  activeTab === tab
                    ? "bg-moss text-white shadow-soft"
                    : "bg-white text-ink"
                }`}
                aria-disabled={isPending || undefined}
                onClick={() => openTab(tab)}
                onKeyDown={(event) => {
                  const index = TABS.indexOf(tab);
                  let next: Tab | undefined;
                  if (event.key === "ArrowRight")
                    next = TABS[(index + 1) % TABS.length];
                  if (event.key === "ArrowLeft")
                    next = TABS[(index - 1 + TABS.length) % TABS.length];
                  if (event.key === "Home") next = TABS[0];
                  if (event.key === "End") next = TABS[TABS.length - 1];
                  if (next) {
                    event.preventDefault();
                    openTab(next);
                    document.getElementById(`project-tab-${next}`)?.focus();
                  }
                }}
                type="button"
              >
                <Icon size={17} />
                {tab}
              </button>
            );
          })}
          <Link
            className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-white px-2 text-sm font-bold text-ink"
            href={`/sales?kind=delivery_note&project=${project.id}`}
            prefetch={false}
          >
            <FileText size={17} />
            Albaranes
          </Link>
          <Link
            className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-white px-2 text-sm font-bold text-ink"
            href={`/sales?kind=invoice&project=${project.id}`}
            prefetch={false}
          >
            <ReceiptText size={17} />
            Facturas
          </Link>
        </div>
      </div>

      {isPending ? <p className="mt-4 text-base font-bold text-moss" role="status">Abriendo {requestedTab}...</p> : null}
      <div
        className="mt-4"
        id="project-panel"
        role="tabpanel"
        aria-labelledby={`project-tab-${activeTab}`}
        aria-busy={isPending}
      >
        {activeTab === "Resumen" ? (
          <section className="section-panel">
            <div className="section-heading">
              <h2>Resumen</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-steel">
                  {project.status}
                </span>
                <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-moss">
                  {project.project_type ?? "Pintura"}
                </span>
                <CloneProjectButton
                  projectId={project.id}
                  projectName={project.name}
                />
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
                    <p className="text-xs font-black uppercase text-muted">
                      Cliente
                    </p>
                    <h3 className="mt-1 text-xl font-black text-ink">
                      {project.client_name}
                    </h3>
                    <p className="mt-1 text-sm font-black text-moss">
                      {project.project_type ?? "Pintura"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {project.address}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {project.client_phone}
                    </p>
                    {project.client_email ? (
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {project.client_email}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg bg-paper p-4">
                    <p className="text-xs font-black uppercase text-muted">
                      Presupuesto estimado
                    </p>
                    <h3 className="mt-1 text-2xl font-black text-ink">
                      {formatCurrency(budgetTotal)}
                    </h3>
                    <p className="mt-2 text-sm font-bold text-muted">
                      IVA no incluido
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-line">
                  <p className="text-xs font-black uppercase text-muted">
                    Descripcion
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
                    {project.description}
                  </p>
                </div>
                {project.internal_notes ? (
                  <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-line">
                    <p className="text-xs font-black uppercase text-muted">
                      Notas internas
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
                      {project.internal_notes}
                    </p>
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
        {activeTab === "Archivos" ? (
          <FileUploader projectId={project.id} files={files} />
        ) : null}
        {activeTab === "Cliente" ? <ClientCard project={project} /> : null}
        {activeTab === "Medidas" ? (
          <RoomCalculator projectId={project.id} rooms={rooms} />
        ) : null}
        {activeTab === "Presupuesto" ? (
          <BudgetBuilder
            projectId={project.id}
            initialVatRate={project.budget_vat_rate}
            items={budgetItems}
            conceptSuggestions={budgetConceptSuggestions}
            rooms={rooms}
          />
        ) : null}
        {activeTab === "Gastos" ? (
          <ProjectFinancePanel
            projectId={project.id}
            budgetTotal={budgetTotal}
            expenses={expenses}
            payments={payments}
          />
        ) : null}
      </div>
    </div>
  );
}
