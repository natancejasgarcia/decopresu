"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, ChevronDown, ChevronUp, Download, GripVertical, Pencil, ReceiptText, Save, Sparkles, Trash2, X } from "lucide-react";
import {
  createBudgetItemAction,
  createBudgetItemsFromRoomsAction,
  deleteBudgetItemAction,
  generateBudgetItemsWithAIAction,
  reorderBudgetItemsAction,
  updateBudgetItemAction,
} from "@/actions/budgetActions";
import { sortBudgetItems } from "@/lib/budget";
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

function getRoomModulesTotal(room: Room) {
  return (room.modules ?? []).reduce((sum, module) => sum + Number(module.total), 0);
}

function getRoomModulesArea(room: Room) {
  return (room.modules ?? [])
    .filter((module) => module.unit.toLowerCase() === "m2")
    .reduce((sum, module) => sum + Number(module.quantity), 0);
}

export function BudgetBuilder({ projectId, items, rooms }: BudgetBuilderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isFixedPrice, setIsFixedPrice] = useState(false);
  const [orderedItems, setOrderedItems] = useState(() => sortBudgetItems(items));
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editIsFixedPrice, setEditIsFixedPrice] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const total = useMemo(() => orderedItems.reduce((sum, item) => sum + Number(item.total), 0), [orderedItems]);
  const roomArea = useMemo(
    () => rooms.reduce((sum, room) => sum + Number(room.total_paintable_area) + getRoomModulesArea(room), 0),
    [rooms],
  );
  const roomEstimate = useMemo(
    () => rooms.reduce((sum, room) => sum + Number(room.total_paintable_area) * Number(room.unit_price ?? 0) + getRoomModulesTotal(room), 0),
    [rooms],
  );

  useEffect(() => {
    setOrderedItems(sortBudgetItems(items));
  }, [items]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      setFormError(null);
      const result = await createBudgetItemAction(formData);
      if (!result?.ok) {
        setFormError(result?.error ?? "No se pudo anadir la linea.");
        return;
      }
      if (result.item) {
        setOrderedItems((currentItems) => sortBudgetItems([...currentItems, result.item]));
      }
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

  function handleAIGenerate() {
    const formData = new FormData();
    formData.set("project_id", projectId);

    startTransition(async () => {
      setFormError(null);
      const result = await generateBudgetItemsWithAIAction(formData);
      if (!result?.ok) {
        setFormError(result?.error ?? "No se pudo generar el presupuesto con IA.");
        return;
      }
      if (result.items?.length) {
        setOrderedItems((currentItems) => sortBudgetItems([...currentItems, ...result.items]));
      }
      router.refresh();
    });
  }

  async function handlePdfDownload() {
    setFormError(null);
    setIsDownloadingPdf(true);

    try {
      const response = await fetch(`/projects/${projectId}/budget/pdf`, {
        credentials: "same-origin",
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error || "No se pudo preparar el PDF.");
      }

      const pdf = await response.blob();
      const filename = response.headers
        .get("content-disposition")
        ?.match(/filename="?([^";]+)"?/i)?.[1] || "Presupuesto-Decoralia.pdf";
      const objectUrl = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo descargar el PDF. Intentalo de nuevo.");
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  function handleUpdate(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("item_id", itemId);

    startTransition(async () => {
      await updateBudgetItemAction(formData);
      setEditingItemId(null);
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

  function startEditing(item: BudgetItem) {
    setEditingItemId(item.id);
    setEditIsFixedPrice(!item.unit);
  }

  function saveOrder(nextItems: BudgetItem[]) {
    setOrderedItems(nextItems);
    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("item_ids", JSON.stringify(nextItems.map((item) => item.id)));

    startTransition(async () => {
      await reorderBudgetItemsAction(formData);
      router.refresh();
    });
  }

  function moveItem(dragId: string, targetId: string) {
    if (dragId === targetId) return;

    const currentItems = [...orderedItems];
    const fromIndex = currentItems.findIndex((item) => item.id === dragId);
    const toIndex = currentItems.findIndex((item) => item.id === targetId);

    if (fromIndex < 0 || toIndex < 0) return;

    const [movedItem] = currentItems.splice(fromIndex, 1);
    currentItems.splice(toIndex, 0, movedItem);
    saveOrder(currentItems);
  }

  function moveItemByStep(itemId: string, direction: -1 | 1) {
    const currentItems = [...orderedItems];
    const index = currentItems.findIndex((item) => item.id === itemId);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= currentItems.length) return;

    const [movedItem] = currentItems.splice(index, 1);
    currentItems.splice(nextIndex, 0, movedItem);
    saveOrder(currentItems);
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <div>
          <h2>Presupuesto</h2>
          <p className="mt-1 text-sm text-muted">Crea conceptos manuales o deja que la IA rellene cards editables desde los archivos de la obra.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-3 text-sm font-black text-white disabled:opacity-60"
            disabled={isPending}
            onClick={handleAIGenerate}
            type="button"
          >
            <Sparkles size={17} />
            {isPending ? "Pensando..." : "Hacer con IA"}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm font-black text-ink disabled:opacity-60"
            disabled={isDownloadingPdf}
            onClick={handlePdfDownload}
            type="button"
          >
            <Download size={17} />
            {isDownloadingPdf ? "Preparando PDF..." : "Descargar PDF"}
          </button>
        </div>
      </div>
      {formError ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-black text-red-700">{formError}</p>
      ) : null}

      <form onSubmit={handleRoomBudgetSubmit} className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-3">
        <input type="hidden" name="project_id" value={projectId} />
        <div className="grid gap-3 rounded-lg bg-paper p-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-black uppercase text-muted">Presupuesto desde habitaciones</p>
            <h3 className="mt-1 text-xl font-black text-ink">{formatCurrency(roomEstimate)}</h3>
            <p className="mt-1 text-sm font-semibold text-muted">
              {rooms.length} habitaciones - {roomArea.toFixed(2)} m2 - una partida agrupada por habitacion
            </p>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60"
            disabled={isPending || roomEstimate <= 0}
          >
            <Calculator size={18} />
            Crear lineas
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
          Anadir linea
        </button>
      </form>

      <div className="mt-5 grid gap-2">
        {orderedItems.length === 0 ? (
          <p className="rounded-lg bg-paper p-4 text-sm text-muted">Anade conceptos para crear el presupuesto.</p>
        ) : (
          orderedItems.map((item, index) => {
            const isEditing = editingItemId === item.id;

            return (
              <article
                key={item.id}
                className={`rounded-lg border border-line bg-white p-3 transition ${draggedItemId === item.id ? "opacity-60" : ""}`}
                draggable={!isPending && !isEditing}
                onDragStart={(event) => {
                  setDraggedItemId(item.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.id);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragId = event.dataTransfer.getData("text/plain") || draggedItemId;
                  if (dragId) moveItem(dragId, item.id);
                  setDraggedItemId(null);
                }}
                onDragEnd={() => setDraggedItemId(null)}
              >
                {isEditing ? (
                  <form onSubmit={(event) => handleUpdate(event, item.id)} className="grid gap-3">
                    <input type="hidden" name="project_id" value={projectId} />
                    <div>
                      <label className="form-label" htmlFor={`concept-${item.id}`}>Concepto</label>
                      <input
                        className="form-input"
                        id={`concept-${item.id}`}
                        name="concept"
                        list="budget-concepts"
                        defaultValue={item.concept}
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label" htmlFor={`notes-${item.id}`}>Notas del concepto</label>
                      <textarea className="form-input min-h-20" id={`notes-${item.id}`} name="notes" defaultValue={item.notes ?? ""} />
                    </div>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-line bg-paper px-3 text-sm font-black text-ink">
                      <input
                        className="h-4 w-4 accent-moss"
                        type="checkbox"
                        checked={editIsFixedPrice}
                        onChange={(event) => setEditIsFixedPrice(event.target.checked)}
                      />
                      Solo precio, sin cantidad ni unidad
                    </label>
                    {editIsFixedPrice ? (
                      <div>
                        <input type="hidden" name="quantity" value="1" />
                        <input type="hidden" name="unit" value="" />
                        <label className="form-label" htmlFor={`unit-price-${item.id}`}>Precio final</label>
                        <input
                          className="form-input"
                          id={`unit-price-${item.id}`}
                          name="unit_price"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={item.unit ? Number(item.total) : Number(item.unit_price)}
                          required
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="form-label" htmlFor={`quantity-${item.id}`}>Cantidad</label>
                          <input className="form-input" id={`quantity-${item.id}`} name="quantity" type="number" min="0.01" step="0.01" defaultValue={Number(item.quantity)} required />
                        </div>
                        <div>
                          <label className="form-label" htmlFor={`unit-${item.id}`}>Unidad</label>
                          <input className="form-input" id={`unit-${item.id}`} name="unit" placeholder="m2, ud, horas..." defaultValue={item.unit || "m2"} required />
                        </div>
                        <div>
                          <label className="form-label" htmlFor={`edit-unit-price-${item.id}`}>Precio</label>
                          <input className="form-input" id={`edit-unit-price-${item.id}`} name="unit_price" type="number" min="0" step="0.01" defaultValue={Number(item.unit_price)} required />
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-moss px-4 text-sm font-black text-white disabled:opacity-60" disabled={isPending}>
                        <Save size={17} />
                        Guardar cambios
                      </button>
                      <button
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-black text-ink"
                        type="button"
                        onClick={() => setEditingItemId(null)}
                      >
                        <X size={17} />
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <GripVertical className="cursor-move text-muted" size={20} aria-hidden />
                      <button
                        className="grid h-7 w-7 place-items-center rounded-md border border-line text-muted disabled:opacity-35"
                        disabled={isPending || index === 0}
                        onClick={() => moveItemByStep(item.id, -1)}
                        title="Subir concepto"
                        type="button"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        className="grid h-7 w-7 place-items-center rounded-md border border-line text-muted disabled:opacity-35"
                        disabled={isPending || index === orderedItems.length - 1}
                        onClick={() => moveItemByStep(item.id, 1)}
                        title="Bajar concepto"
                        type="button"
                      >
                        <ChevronDown size={15} />
                      </button>
                    </div>
                    <div>
                      <strong className="block text-ink">{item.concept}</strong>
                      <span className="text-sm text-muted">
                        {item.unit ? `${Number(item.quantity)} ${item.unit} x ${formatCurrency(Number(item.unit_price))}` : "Precio cerrado"}
                      </span>
                      {item.notes ? <p className="mt-1 text-sm text-muted">{item.notes}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <strong className="whitespace-nowrap text-ink">{formatCurrency(Number(item.total))}</strong>
                      <button
                        className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => startEditing(item)}
                        title="Editar concepto"
                        type="button"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="grid h-10 w-10 place-items-center rounded-lg border border-line text-red-700 disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => handleDelete(item.id)}
                        title="Borrar concepto"
                        type="button"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
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
