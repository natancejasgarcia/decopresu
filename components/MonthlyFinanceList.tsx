import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function MonthlyFinanceList({
  children,
  kind,
}: {
  children: ReactNode[];
  kind: "gastos" | "cobros";
}) {
  const remaining = children.length - 8;
  return (
    <>
      {children.slice(0, 8)}
      {remaining > 0 && (
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-moss hover:border-moss [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Ver {remaining} {remaining === 1 ? kind.slice(0, -1) : kind}{" "}
              {remaining === 1 ? "restante" : "restantes"}
            </span>
            <span className="hidden group-open:inline">
              Ocultar {kind} adicionales
            </span>
            <ChevronDown
              size={18}
              className="shrink-0 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-2 space-y-2">{children.slice(8)}</div>
        </details>
      )}
    </>
  );
}
