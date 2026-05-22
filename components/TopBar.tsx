import Link from "next/link";
import { Building2, LogOut } from "lucide-react";
import { signOutAction } from "@/actions/authActions";
import type { Profile } from "@/lib/types";

type TopBarProps = {
  profile: Profile;
};

export function TopBar({ profile }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-moss text-white">
            <Building2 size={21} />
          </div>
          <div>
            <p className="text-base font-black text-ink">Decoralia Proyectos</p>
            <p className="text-xs font-medium text-muted">{profile.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-1 rounded-lg bg-paper p-1 sm:flex">
            <Link className="rounded-md px-3 py-2 text-sm font-black text-ink hover:bg-white" href="/dashboard">Inicio</Link>
            <Link className="rounded-md px-3 py-2 text-sm font-black text-ink hover:bg-white" href="/projects">Proyectos</Link>
            <Link className="rounded-md px-3 py-2 text-sm font-black text-ink hover:bg-white" href="/finance">Finanzas</Link>
            <Link className="rounded-md px-3 py-2 text-sm font-black text-ink hover:bg-white" href="/emails">Correos</Link>
          </nav>
          <form action={signOutAction}>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-bold text-ink">
              <LogOut size={17} />
              Salir
            </button>
          </form>
        </div>
      </div>
      <nav className="flex gap-2 border-t border-line px-4 py-2 sm:hidden">
        <Link className="flex-1 rounded-lg bg-paper px-3 py-2 text-center text-sm font-black text-ink" href="/dashboard">Inicio</Link>
        <Link className="flex-1 rounded-lg bg-paper px-3 py-2 text-center text-sm font-black text-ink" href="/projects">Obras</Link>
        <Link className="flex-1 rounded-lg bg-paper px-3 py-2 text-center text-sm font-black text-ink" href="/finance">Finanzas</Link>
        <Link className="flex-1 rounded-lg bg-paper px-3 py-2 text-center text-sm font-black text-ink" href="/emails">Correos</Link>
      </nav>
    </header>
  );
}
