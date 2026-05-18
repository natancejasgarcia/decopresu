import { EmailComposer } from "@/components/EmailComposer";
import { TopBar } from "@/components/TopBar";
import { formatDate } from "@/lib/calculations";
import { requireUserProfile } from "@/lib/auth";
import type { Project, SentEmail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const { supabase, profile } = await requireUserProfile();
  const [
    { data: projects, error: projectsError },
    { data: emails, error: emailsError },
  ] = await Promise.all([
    supabase.from("projects").select("*").order("last_activity_at", { ascending: false }).returns<Project[]>(),
    supabase.from("sent_emails").select("*").order("created_at", { ascending: false }).limit(30).returns<SentEmail[]>(),
  ]);

  if (projectsError) {
    throw new Error(projectsError.message);
  }

  const emailsTableMissing = emailsError?.code === "42P01";

  if (emailsError && !emailsTableMissing) {
    throw new Error(emailsError.message);
  }

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5">
        <EmailComposer projects={projects ?? []} />
        <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="mb-4">
            <p className="text-xs font-black uppercase text-clay">Historial</p>
            <h2 className="text-xl font-black text-ink">Ultimos correos</h2>
          </div>
          <div className="grid gap-2">
            {(emailsTableMissing ? [] : (emails ?? [])).length === 0 ? (
              <p className="rounded-lg bg-paper p-4 text-sm font-semibold text-muted">Todavia no hay correos enviados.</p>
            ) : (
              (emails ?? []).map((email) => (
                <article key={email.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <strong className="block text-ink">{email.subject}</strong>
                      <p className="mt-1 text-sm font-semibold text-muted">{email.to_email} - {formatDate(email.created_at)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${email.status === "sent" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                      {email.status === "sent" ? "Enviado" : "Error"}
                    </span>
                  </div>
                  {email.error_message ? <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-700">{email.error_message}</p> : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
