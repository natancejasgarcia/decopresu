import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/PrintButton";
import { sortBudgetItems } from "@/lib/budget";
import { formatCurrency } from "@/lib/calculations";
import { requireUserProfile } from "@/lib/auth";
import type { BudgetItem, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

type PrintBudgetPageProps = {
  params: {
    id: string;
  };
};

const VAT_RATE = 0.21;

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getBudgetNumber(project: Project) {
  const year = new Date(project.created_at).getFullYear();
  return `${year}-${project.id.slice(0, 4).toUpperCase()}`;
}

export default async function PrintBudgetPage({ params }: PrintBudgetPageProps) {
  const { supabase } = await requireUserProfile();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single<Project>();

  if (!project) {
    notFound();
  }

  const { data: budgetData } = await supabase
    .from("budget_items")
    .select("*")
    .eq("project_id", params.id)
    .order("created_at", { ascending: true })
    .returns<BudgetItem[]>();

  const items = sortBudgetItems(budgetData ?? []);
  const taxableBase = items.reduce((sum, item) => sum + Number(item.total), 0);
  const vat = taxableBase * VAT_RATE;
  const total = taxableBase + vat;
  const issuedAt = new Date();
  const expiresAt = addDays(issuedAt, 14);

  return (
    <main className="min-h-screen bg-[#f3f3f1] px-4 py-6 text-[#1f2933] print:bg-white print:px-0 print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[794px] items-center justify-between">
        <Link href={`/projects/${params.id}`} className="inline-flex items-center gap-2 text-sm font-black text-moss">
          <ArrowLeft size={17} />
          Volver
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto min-h-[1123px] max-w-[794px] bg-white px-12 py-10 shadow-soft print:min-h-0 print:max-w-none print:px-10 print:py-8 print:shadow-none">
        <header className="border-b-2 border-[#22313a] pb-6">
          <div className="mb-7 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/decoralia-logo.png"
              alt="Decoralia Pintores"
              className="h-auto w-full max-w-[620px] object-contain"
            />
          </div>
          <div className="grid grid-cols-[1fr_240px] gap-8">
          <div>
            <h1 className="text-[30px] font-black tracking-wide text-[#152630]">PRESUPUESTO</h1>
            <div className="mt-7">
              <h2 className="text-[17px] font-black text-[#152630]">Decoralia Pintores</h2>
              <p className="mt-2 text-[13px] leading-6 text-[#4a5560]">Teléfono: 653 529 351</p>
              <p className="text-[13px] leading-6 text-[#4a5560]">Email: info@decoraliapintores.com</p>
              <p className="text-[13px] leading-6 text-[#4a5560]">CIF/NIF: —</p>
            </div>
          </div>

          <dl className="grid content-start gap-3 rounded-sm bg-[#f2f2ef] p-4 text-[13px]">
            <div>
              <dt className="font-black uppercase text-[#58636c]">Nº Presupuesto:</dt>
              <dd className="mt-1 font-bold text-[#152630]">{getBudgetNumber(project)}</dd>
            </div>
            <div>
              <dt className="font-black uppercase text-[#58636c]">Fecha emisión:</dt>
              <dd className="mt-1 font-bold text-[#152630]">{formatShortDate(issuedAt)}</dd>
            </div>
            <div>
              <dt className="font-black uppercase text-[#58636c]">Fecha vencimiento:</dt>
              <dd className="mt-1 font-bold text-[#152630]">{formatShortDate(expiresAt)}</dd>
            </div>
          </dl>
          </div>
        </header>

        <section className="mt-8">
          <h2 className="border-b border-[#d8ddd8] pb-2 text-[14px] font-black uppercase tracking-wide text-[#152630]">
            Datos del cliente
          </h2>
          <div className="mt-4 grid grid-cols-[110px_1fr] gap-x-5 gap-y-2 text-[13px] leading-6">
            <span className="font-black text-[#58636c]">Nombre:</span>
            <span>{project.client_name}</span>
            <span className="font-black text-[#58636c]">DNI:</span>
            <span>—</span>
            <span className="font-black text-[#58636c]">Dirección:</span>
            <span>{project.address}</span>
            <span className="font-black text-[#58636c]">Teléfono:</span>
            <span>{project.client_phone}</span>
            {project.client_email ? (
              <>
                <span className="font-black text-[#58636c]">Email:</span>
                <span>{project.client_email}</span>
              </>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="border-b border-[#d8ddd8] pb-2 text-[14px] font-black uppercase tracking-wide text-[#152630]">
            Trabajos a realizar
          </h2>
          <h3 className="mt-4 text-[15px] font-black text-[#152630]">{project.name}</h3>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-[#303c44]">{project.description}</p>
          <p className="mt-4 text-[13px] font-black text-[#152630]">Trabajos incluidos:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-6 text-[#303c44]">
            <li>Preparación de superficies.</li>
            <li>Protección de zonas de trabajo.</li>
            <li>Aplicación de los materiales correspondientes.</li>
            <li>Limpieza básica final de la zona de trabajo.</li>
          </ul>
        </section>

        <section className="mt-8">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#152630] text-left text-white">
                <th className="px-3 py-3 font-black uppercase">Descripción</th>
                <th className="w-20 px-3 py-3 text-right font-black uppercase">Cant.</th>
                <th className="w-32 px-3 py-3 text-right font-black uppercase">Precio unit.</th>
                <th className="w-32 px-3 py-3 text-right font-black uppercase">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr className="border-b border-[#d8ddd8]">
                  <td className="px-3 py-4 text-[#58636c]" colSpan={4}>
                    No hay conceptos añadidos.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-[#d8ddd8] align-top">
                    <td className="px-3 py-4 font-bold text-[#152630]">{item.concept}</td>
                    <td className="px-3 py-4 text-right">{item.unit ? `${Number(item.quantity)} ${item.unit}` : ""}</td>
                    <td className="px-3 py-4 text-right">{item.unit ? formatCurrency(Number(item.unit_price)) : ""}</td>
                    <td className="px-3 py-4 text-right font-black">{formatCurrency(Number(item.total))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-7 ml-auto w-full max-w-[330px] text-[14px]">
          <div className="grid grid-cols-[1fr_auto] gap-y-3 border-b border-[#d8ddd8] pb-3">
            <span className="font-black text-[#58636c]">Base imponible:</span>
            <span className="font-bold">{formatCurrency(taxableBase)}</span>
            <span className="font-black text-[#58636c]">IVA (21%):</span>
            <span className="font-bold">{formatCurrency(vat)}</span>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-center rounded-sm bg-[#152630] px-4 py-3 text-white">
            <span className="text-[16px] font-black">TOTAL:</span>
            <span className="text-[18px] font-black">{formatCurrency(total)}</span>
          </div>
        </section>

        <footer className="mt-12 border-t border-[#d8ddd8] pt-5 text-center text-[13px] font-bold text-[#58636c]">
          Gracias por confiar en Decoralia Pintores.
        </footer>
      </article>
    </main>
  );
}
