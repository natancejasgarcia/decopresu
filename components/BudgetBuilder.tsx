"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, Printer, ReceiptText, Trash2 } from "lucide-react";
import { createBudgetItemAction, deleteBudgetItemAction } from "@/actions/budgetActions";
import { formatCurrency } from "@/lib/calculations";
import type { BudgetItem, Room } from "@/lib/types";

type BudgetBuilderProps = {
  projectId: string;
  items: BudgetItem[];
  rooms: Room[];
};

const CONCEPTS = [
  "Pintura paredes",
  "Pintura techos",
  "Esmalte",
  "Lacado de puertas",
  "Reparaciones",
  "Materiales",
  "Mano de obra",
  "Otros",
];

export function BudgetBuilder({ projectId, items, rooms }: BudgetBuilderProps) {
  const router = useRouter();
  const [pricePerMeter, setPricePerMeter] = useState(6);
  const [isPending, startTransition] = useTransition();
  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.total), 0), [items]);
  const roomArea = useMemo(
    () => rooms.reduce((sum, room) => sum + Number(room.total_paintable_area), 0),
    [rooms],
  );
  const roomEstimate = roomArea * pricePerMeter;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await createBudgetItemAction(formData);
      form.reset();
      router.refresh();
    });
  }

  function handleRoomBudgetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (roomArea <= 0) return;

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await createBudgetItemAction(formData);
      router.refresh();
    });
  }

  function handleDelete(itemId: string) {
    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("item_id", itemId);

    startTransition(async () => {
      await deleteBudgetItemAction(formData);
      router.refresh();
    });
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <h2>Presupuesto</h2>
        <Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-black text-ink" href={`/projects/${projectId}/budget/print`}>
          <Printer size={17} />
          Imprimir
        </Link>
      </div>

      <form onSubmit={handleRoomBudgetSubmit} className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-3">
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="concept" value="Pintura según mediciones" />
        <input type="hidden" name="quantity" value={roomArea.toFixed(2)} />
        <input type="hidden" name="unit" value="m2" />
        <input type="hidden" name="unit_price" value={pricePerMeter} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-muted">Presupuesto por metros</p>
            <h3 className="mt-1 text-xl font-black text-ink">{roomArea.toFixed(2)} m2 medidos</h3>
            <p className="mt-1 text-sm font-semibold text-muted">
              {rooms.length} habitaciones · {formatCurrency(pricePerMeter)} / m2
            </p>
          </div>
          <div className="grid gap-1 sm:w-44">
            <label className="form-label" htmlFor="price-per-meter">Precio por m2</label>
            <input
              className="form-input"
              id="price-per-meter"
              type="number"
              min="0"
              step="0.01"
              value={pricePerMeter}
              onChange={(event) => setPricePerMeter(Number(event.target.value) || 0)}
            />
          </div>
        </div>
        <div className="grid gap-3 rounded-lg bg-paper p-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <span className="text-sm font-bold text-muted">Estimación con habitaciones</span>
            <strong className="mt-1 block text-2xl text-ink">{formatCurrency(roomEstimate)}</strong>
            <p className="text-sm font-bold text-muted">IVA no incluido</p>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60"
            disabled={isPending || roomArea <= 0}
          >
            <Calculator size={18} />
            Añadir por m2
          </button>
        </div>
      </form>

      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg bg-paper p-3">
        <input type="hidden" name="project_id" value={projectId} />
        <div>
          <label className="form-label" htmlFor="concept">Concepto</label>
          <select className="form-input" id="concept" name="concept" defaultValue="Pintura paredes">
            {CONCEPTS.map((concept) => (
              <option key={concept} value={concept}>{concept}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="form-label" htmlFor="quantity">Cantidad</label>
            <input className="form-input" id="quantity" name="quantity" type="number" min="0" step="0.01" defaultValue="1" required />
          </div>
          <div>
            <label className="form-label" htmlFor="unit">Unidad</label>
            <input className="form-input" id="unit" name="unit" defaultValue="m2" required />
          </div>
          <div>
            <label className="form-label" htmlFor="unit_price">Precio</label>
            <input className="form-input" id="unit_price" name="unit_price" type="number" min="0" step="0.01" defaultValue="0" required />
          </div>
        </div>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60" disabled={isPending}>
          <ReceiptText size={18} />
          Añadir línea
        </button>
      </form>

      <div className="mt-5 grid gap-2">
        {items.length === 0 ? (
          <p className="rounded-lg bg-paper p-4 text-sm text-muted">Añade conceptos para crear el presupuesto.</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-line bg-white p-3">
              <div>
                <strong className="block text-ink">{item.concept}</strong>
                <span className="text-sm text-muted">{Number(item.quantity)} {item.unit} x {formatCurrency(Number(item.unit_price))}</span>
              </div>
              <strong className="text-ink">{formatCurrency(Number(item.total))}</strong>
              <button
                className="grid h-10 w-10 place-items-center rounded-lg border border-line text-red-700 disabled:opacity-50"
                disabled={isPending}
                onClick={() => handleDelete(item.id)}
                title="Borrar concepto"
                type="button"
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))
        )}
      </div>
      <div className="mt-4 rounded-lg bg-ink p-4 text-white">
        <span className="block text-sm font-bold text-white/70">Total presupuesto</span>
        <strong className="text-2xl">{formatCurrency(total)}</strong>
        <p className="mt-1 text-sm font-bold text-white/75">IVA no incluido</p>
      </div>
    </section>
  );
}
