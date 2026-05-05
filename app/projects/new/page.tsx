import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProjectForm } from "@/components/ProjectForm";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const { profile } = await requireUserProfile();

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-3xl px-4 py-5">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-black text-moss">
          <ArrowLeft size={17} />
          Volver
        </Link>
        <div className="my-5">
          <p className="text-xs font-black uppercase text-clay">Nuevo proyecto</p>
          <h1 className="mt-1 text-3xl font-black text-ink">Crear obra</h1>
        </div>
        <ProjectForm />
      </div>
    </main>
  );
}
