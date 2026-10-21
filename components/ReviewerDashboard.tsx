import Link from "next/link";
import { ArrowRight, FileCheck2, ReceiptText } from "lucide-react";

export function ReviewerDashboard() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold">Inicio</h1>
      <section
        aria-label="Accesos de trabajo"
        className="grid grid-cols-2 gap-3"
      >
        {[
          {
            href: "/validations",
            title: "Validaciones",
            icon: FileCheck2,
          },
          { href: "/finance/scan", title: "Subir facturas", icon: ReceiptText },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="flex min-h-40 min-w-0 flex-col justify-between gap-6 rounded-lg border border-line bg-white p-4 text-moss hover:border-moss"
          >
            <span className="flex items-center justify-between gap-2">
              <item.icon size={28} />
              <ArrowRight size={20} />
            </span>
            <h2 className="break-words text-base font-bold leading-snug">
              {item.title}
            </h2>
          </Link>
        ))}
      </section>
    </div>
  );
}
