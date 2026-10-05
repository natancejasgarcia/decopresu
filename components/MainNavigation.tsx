"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  House,
  ReceiptText,
  UsersRound,
  WalletCards,
} from "lucide-react";
const items = [
  { href: "/dashboard", label: "Inicio", icon: House },
  { href: "/projects", label: "Obras", icon: FolderKanban },
  { href: "/sales", label: "Ventas", icon: ReceiptText },
  { href: "/finance", label: "Finanzas", icon: WalletCards },
  { href: "/clients", label: "Clientes", icon: UsersRound },
];
export function MainNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={
        mobile ? "Navegación principal móvil" : "Navegación principal"
      }
      className={
        mobile
          ? "fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
          : "hidden items-center gap-1 lg:flex"
      }
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            href={item.href}
            key={item.href}
            aria-current={active ? "page" : undefined}
            className={`${mobile ? "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs" : "flex min-h-12 items-center gap-2 rounded-lg px-3 text-base"} font-bold ${active ? "bg-emerald-50 text-moss" : "text-ink hover:bg-paper"}`}
          >
            <Icon size={mobile ? 22 : 18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
