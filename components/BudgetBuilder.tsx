"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, Download, ReceiptText, Trash2 } from "lucide-react";
import { createBudgetItemAction, createBudgetItemsFromRoomsAction, deleteBudgetItemAction } from "@/actions/budgetActions";
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
  const [isPending, startTransition] = useTransition();
  const [isFixedPrice, setIsFixedPrice] = useState(false);
  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.total), 0), [items]);
  const roomArea = useMemo(
    () => rooms.reduce((sum, room) => sum + Number(room.total_paintable_area), 0),
    [rooms],
  );
  const roomEstimate = useMemo(
    () => rooms.reduce((sum, room) => sum + Number(room.total_paintable_area) * Number(room.unit_price ?? 0), 0),
    [rooms],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await createBudgetItemAction(formData);
      form.reset();
      setIsFixedPrice(false);
      router.refresh();
    });
  }

  function handleRoomBudgetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await createBudgetItemsFromRoomsAction(formData);
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
        <Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-black text-ink" href={`/projects/${projectId}/budget/pdf`}>
          <Download size={17} />
          Descargar PDF
        </Link>
      </div>

      <form onSubmit={handleRoomBudgetSubmit} className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-3">
        <input type="hidden" name="project_id" value={projectId} />
        <div className="grid gap-3 rounded-lg bg-paper p-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-black uppercase text-muted">Presupuesto desde habitaciones</p>
            <h3 className="mt-1 text-xl font-black text-ink">{formatCurrency(roomEstimate)}</h3>
            <p className="mt-1 text-sm font-semibold text-muted">
              {rooms.length} habitaciones · {roomArea.toFixed(2)} m2 · precio propio por habitación
            </p>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60"
            disabled={isPending || roomArea <= 0}
          >
            <Calculator size={18} />
            Crear líneas
          </button>
        </div>
      </form>

      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg bg-paper p-3">
        <input type="hidden" name="project_id" value={projectId} />
        <div>
          <label className="form-label" htmlFor="concept">Concepto</label>
          <input
            className="form-input"
            id="concept"
            name="concept"
            list="budget-concepts"
            placeholder="Pintura paredes, materiales, mano de obra..."
            required
          />
          <datalist id="budget-concepts">
            {CONCEPTS.map((concept) => (
              <option key={concept} value={concept} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="form-label" htmlFor="notes">Notas del concepto</label>
          <textarea className="form-input min-h-20" id="notes" name="notes" placeholder="Detalle del trabajo, acabado, materiales o condiciones..." />
        </div>

        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink">
          <input
            className="h-4 w-4 accent-moss"
            type="checkbox"
            checked={isFixedPrice}
            onChange={(event) => setIsFixedPrice(event.target.checked)}
          />
          Solo precio, sin cantidad ni unidad
        </label>

        {isFixedPrice ? (
          <div>
            <input type="hidden" name="quantity" value="1" />
            <input type="hidden" name="unit" value="" />
            <label className="form-label" htmlFor="unit_price">Precio final</label>
            <input className="form-input" id="unit_price" name="unit_price" type="number" min="0" step="0.01" defaultValue="0" required />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label" htmlFor="quantity">Cantidad</label>
              <input className="form-input" id="quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required />
            </div>
            <div>
              <label className="form-label" htmlFor="unit">Unidad</label>
              <input className="form-input" id="unit" name="unit" placeholder="m2, ud, horas..." defaultValue="m2" required />
            </div>
            <div>
              <label className="form-label" htmlFor="unit_price">Precio</label>
              <input className="form-input" id="unit_price" name="unit_price" type="number" min="0" step="0.01" defaultValue="0" required />
            </div>
          </div>
        )}
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
                <span className="text-sm text-muted">
                  {item.unit ? `${Number(item.quantity)} ${item.unit} x ${formatCurrency(Number(item.unit_price))}` : "Precio cerrado"}
                </span>
                {item.notes ? <p className="mt-1 text-sm text-muted">{item.notes}</p> : null}
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
