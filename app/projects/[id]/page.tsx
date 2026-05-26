import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { ProjectTabs } from "@/components/ProjectTabs";
import { sortBudgetItems } from "@/lib/budget";
import { formatCurrency } from "@/lib/calculations";
import { requireUserProfile } from "@/lib/auth";
import type { BudgetItem, Message, Profile, Project, ProjectExpense, ProjectFile, ProjectPayment, Room, RoomModule } from "@/lib/types";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: {
    id: string;
  };
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { supabase, profile } = await requireUserProfile();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single<Project>();

  if (!project) {
    notFound();
  }

  const [
    { data: messageData },
    { data: fileData },
    { data: roomData },
    { data: roomModuleData, error: roomModuleError },
    { data: budgetData },
    { data: profileData },
    { data: expenseData, error: expenseError },
    { data: paymentData, error: paymentError },
  ] = await Promise.all([
    supabase.from("messages").select("*").eq("project_id", params.id).order("created_at", { ascending: true }).returns<Message[]>(),
    supabase.from("project_files").select("*").eq("project_id", params.id).order("created_at", { ascending: false }).returns<ProjectFile[]>(),
    supabase.from("rooms").select("*").eq("project_id", params.id).order("created_at", { ascending: false }).returns<Room[]>(),
    supabase.from("room_modules").select("*").eq("project_id", params.id).order("created_at", { ascending: true }).returns<RoomModule[]>(),
    supabase.from("budget_items").select("*").eq("project_id", params.id).order("created_at", { ascending: true }).returns<BudgetItem[]>(),
    supabase.from("profiles").select("*").returns<Profile[]>(),
    supabase.from("project_expenses").select("*").eq("project_id", params.id).order("expense_date", { ascending: false }).returns<ProjectExpense[]>(),
    supabase.from("project_payments").select("*").eq("project_id", params.id).order("payment_date", { ascending: false }).returns<ProjectPayment[]>(),
  ]);

  const messages = messageData ?? [];
  const files = fileData ?? [];
  const modules = isOptionalRoomModulesError(roomModuleError) ? [] : (roomModuleData ?? []);
  const modulesByRoom = new Map<string, RoomModule[]>();
  for (const module of modules) {
    modulesByRoom.set(module.room_id, [...(modulesByRoom.get(module.room_id) ?? []), module]);
  }
  const rooms = (roomData ?? []).map((room) => ({
    ...room,
    modules: modulesByRoom.get(room.id) ?? [],
  }));
  const budgetItems = sortBudgetItems(budgetData ?? []);
  const expenses = expenseError?.code === "42P01" ? [] : (expenseData ?? []);
  const payments = paymentError?.code === "42P01" ? [] : (paymentData ?? []);
  const profiles = profileData ?? [];
  const profileMap = new Map(profiles.map((item) => [item.user_id, item.name]));
  const enrichedMessages = messages.map((message) => ({
    ...message,
    user_name: profileMap.get(message.user_id) ?? "Decoralia",
  }));

  const filesWithSignedUrls = await Promise.all(
    files.map(async (file) => {
      const { data } = await supabase.storage.from("project-files").createSignedUrl(file.file_url, 60 * 60);
      return { ...file, signed_url: data?.signedUrl };
    }),
  );
  const paymentsWithSignedReceipts = await Promise.all(
    payments.map(async (payment) => {
      if (!payment.receipt_file_url) return payment;

      const { data } = await supabase.storage.from("project-files").createSignedUrl(payment.receipt_file_url, 60 * 60);
      return { ...payment, receipt_signed_url: data?.signedUrl };
    }),
  );

  const totalBudget = budgetItems.reduce((sum, item) => sum + Number(item.total), 0);

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <Link href="/projects" className="inline-flex items-center gap-2 text-sm font-black text-moss">
          <ArrowLeft size={17} />
          Proyectos
        </Link>
        <section className="my-5 rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <p className="rounded-full bg-paper px-3 py-1 text-xs font-black uppercase text-clay">{project.status}</p>
                <p className="rounded-full bg-paper px-3 py-1 text-xs font-black uppercase text-moss">{project.project_type ?? "Pintura"}</p>
              </div>
              <h1 className="mt-1 text-3xl font-black leading-tight text-ink sm:text-4xl">{project.name}</h1>
              <p className="mt-2 text-sm font-semibold text-muted">{project.client_name} · {project.address}</p>
            </div>
            <div className="rounded-lg bg-paper p-4 md:min-w-56">
              <span className="text-xs font-black uppercase text-muted">Presupuesto</span>
              <strong className="mt-1 block text-2xl text-ink">{formatCurrency(totalBudget)}</strong>
              <p className="mt-1 text-sm font-bold text-muted">IVA no incluido</p>
            </div>
          </div>
        </section>
        <ProjectTabs
          project={project}
          profile={profile}
          messages={enrichedMessages}
          files={filesWithSignedUrls}
          rooms={rooms}
          budgetItems={budgetItems}
          expenses={expenses}
          payments={paymentsWithSignedReceipts}
        />
      </div>
    </main>
  );
}

function isOptionalRoomModulesError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501" || error.code === "PGRST205";
}
