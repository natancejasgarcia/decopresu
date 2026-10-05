"use client";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { signOutAction } from "@/actions/authActions";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-5 px-5">
      <h1 className="text-2xl font-bold">No se pudo abrir esta pantalla</h1>
      <p>Comprueba la conexión y vuelve a intentarlo.</p>
      <div className="flex flex-wrap gap-3">
        <button className="action-primary" type="button" onClick={reset}>
          <RefreshCw size={20} />
          Volver a intentar
        </button>
        <Link className="action-secondary" href="/dashboard">
          Ir al inicio
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="action-secondary">
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
