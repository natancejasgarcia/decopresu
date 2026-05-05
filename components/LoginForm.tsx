"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, LockKeyhole } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "unauthorized"
      ? "Tu usuario existe, pero no esta autorizado en Decoralia."
      : null,
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      setError(null);
      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError("Email o contraseña incorrectos.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <section className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-moss text-white">
          <Building2 size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-ink">Decoralia Proyectos</h1>
          <p className="text-sm font-medium text-muted">Acceso privado</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div>
          <label className="form-label" htmlFor="email">Email</label>
          <input className="form-input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="form-label" htmlFor="password">Contraseña</label>
          <input className="form-input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-5 font-black text-white disabled:opacity-60" disabled={isPending}>
          <LockKeyhole size={18} />
          Entrar
        </button>
      </form>
      <p className="mt-5 text-sm leading-6 text-muted">
        No hay registro publico. Crea Jose Antonio y Padre desde Supabase Auth y añade sus perfiles autorizados.
      </p>
    </section>
  );
}
