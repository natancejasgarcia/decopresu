import { Building2, LogOut } from "lucide-react";
import { MainNavigation } from "@/components/MainNavigation";
import { signOutAction } from "@/actions/authActions";
import type { Profile } from "@/lib/types";

type TopBarProps = {
  profile: Profile;
};

export function TopBar({ profile }: TopBarProps) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-moss text-white">
              <Building2 size={21} />
            </div>
            <div>
              <p className="text-lg font-bold text-ink">Decoralia</p>
              <p className="text-sm font-medium text-muted">{profile.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MainNavigation reviewer={profile.access_role === "reviewer"} />
            <form action={signOutAction}>
              <button className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-line px-3 text-base font-bold text-ink">
                <LogOut size={17} />
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <MainNavigation mobile reviewer={profile.access_role === "reviewer"} />
    </>
  );
}
