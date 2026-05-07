"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Pencil, Ruler, Trash2, X } from "lucide-react";
import { createRoomAction, deleteRoomAction, updateRoomAction } from "@/actions/roomActions";
import { calculateRoomAreas, formatCurrency } from "@/lib/calculations";
import type { Room, RoomPaintScope } from "@/lib/types";

type RoomCalculatorProps = {
  projectId: string;
  rooms: Room[];
};

type PreviewState = {
  length: number;
  width: number;
  height: number;
  openingsArea: number;
  paintScope: RoomPaintScope;
};

export function RoomCalculator({ projectId, rooms }: RoomCalculatorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({
    length: 0,
    width: 0,
    height: 0,
    openingsArea: 0,
    paintScope: "walls_and_ceiling",
  });
  const calculated = calculateRoomAreas(preview);
  const projectTotal = useMemo(
    () => rooms.reduce((total, room) => total + Number(room.total_paintable_area), 0),
    [rooms],
  );
  const projectEstimate = useMemo(
    () => rooms.reduce((total, room) => total + Number(room.total_paintable_area) * Number(room.unit_price ?? 0), 0),
    [rooms],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await createRoomAction(formData);
      form.reset();
      setPreview({ length: 0, width: 0, height: 0, openingsArea: 0, paintScope: "walls_and_ceiling" });
      router.refresh();
    });
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await updateRoomAction(formData);
      setEditingRoomId(null);
      router.refresh();
    });
  }

  function handleDelete(roomId: string) {
    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("room_id", roomId);
    startTransition(async () => {
      await deleteRoomAction(formData);
      router.refresh();
    });
  }

  function updatePreview(form: HTMLFormElement) {
    const formData = new FormData(form);
    setPreview({
      length: Number(formData.get("length") || 0),
      width: Number(formData.get("width") || 0),
      height: Number(formData.get("height") || 0),
      openingsArea: Number(formData.get("openings_area") || 0),
      paintScope: String(formData.get("paint_scope") || "walls_and_ceiling") as RoomPaintScope,
    });
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <div>
          <h2>Plano por habitaciones</h2>
          <p className="mt-1 text-sm font-semibold text-muted">Cada habitación tiene su propio tipo de trabajo y precio por m2.</p>
        </div>
        <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-moss">
          {projectTotal.toFixed(2)} m2
        </span>
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-3">
        <p className="text-xs font-black uppercase text-muted">Valor del proyecto por habitaciones</p>
        <strong className="mt-1 block text-2xl text-ink">{formatCurrency(projectEstimate)}</strong>
        <p className="mt-1 text-sm font-bold text-muted">
          {projectTotal.toFixed(2)} m2 calculados con el precio de cada habitación · IVA no incluido
        </p>
      </div>

      <form onSubmit={handleSubmit} onChange={(event) => updatePreview(event.currentTarget)} className="grid gap-3 rounded-lg bg-paper p-3">
        <input type="hidden" name="project_id" value={projectId} />
        <RoomFields calculatedTotal={calculated.totalPaintableArea} />
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Metric label="Techo" value={calculated.ceilingArea} />
          <Metric label="Paredes" value={calculated.wallArea} />
          <Metric label="Descuento" value={preview.paintScope === "ceiling_only" ? 0 : calculated.openingsArea} />
          <Metric label="Total estancia" value={calculated.totalPaintableArea} />
        </div>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60" disabled={isPending}>
          <Ruler size={18} />
          Añadir habitación
        </button>
      </form>

      <div className="mt-5 grid gap-3">
        {rooms.length === 0 ? (
          <p className="rounded-lg bg-paper p-4 text-sm text-muted">Añade habitaciones para calcular los metros del proyecto.</p>
        ) : (
          rooms.map((room) => {
            const roomTotal = Number(room.total_paintable_area);
            const roomPrice = Number(room.unit_price ?? 0);
            const isCeilingOnly = room.paint_scope === "ceiling_only";

            if (editingRoomId === room.id) {
              return (
                <form key={room.id} onSubmit={handleEditSubmit} className="grid gap-3 rounded-lg border border-moss bg-white p-3">
                  <input type="hidden" name="project_id" value={projectId} />
                  <input type="hidden" name="room_id" value={room.id} />
                  <RoomFields room={room} calculatedTotal={roomTotal} />
                  <div className="flex gap-2">
                    <button className="h-10 flex-1 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60" disabled={isPending}>
                      Guardar cambios
                    </button>
                    <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink" type="button" onClick={() => setEditingRoomId(null)}>
                      <X size={18} />
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <article key={room.id} className="rounded-lg border border-line bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-ink">{room.name}</h3>
                      <span className="rounded-full bg-paper px-2 py-1 text-xs font-black text-steel">
                        {isCeilingOnly ? "Solo techo" : "Techo + paredes"}
                      </span>
                    </div>
                    {room.notes ? <p className="mt-1 text-sm text-muted">{room.notes}</p> : null}
                  </div>
                  <div className="text-right">
                    <strong className="block text-lg text-moss">{roomTotal.toFixed(2)} m2</strong>
                    <span className="text-sm font-bold text-muted">{formatCurrency(roomTotal * roomPrice)}</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-5">
                  <span>Techo {Number(room.ceiling_area).toFixed(2)} m2</span>
                  <span>Paredes {Number(room.wall_area).toFixed(2)} m2</span>
                  <span>Descuento {isCeilingOnly ? "0.00" : Number(room.openings_area).toFixed(2)} m2</span>
                  <span>{room.length} x {room.width} x {room.height} m</span>
                  <span>{formatCurrency(roomPrice)} / m2</span>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-black text-ink" type="button" onClick={() => setEditingRoomId(room.id)}>
                    <Pencil size={16} />
                    Editar
                  </button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-black text-red-700 disabled:opacity-60" type="button" disabled={isPending} onClick={() => handleDelete(room.id)}>
                    <Trash2 size={16} />
                    Borrar
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="mt-4 grid gap-3 rounded-lg bg-ink p-4 text-white sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <span className="block text-sm font-bold text-white/70">Total por mediciones</span>
          <strong className="text-2xl">{formatCurrency(projectEstimate)}</strong>
          <p className="mt-1 text-sm font-bold text-white/75">IVA no incluido</p>
        </div>
        <Calculator size={28} className="hidden sm:block" />
      </div>
    </section>
  );
}

function RoomFields({ room, calculatedTotal }: { room?: Room; calculatedTotal: number }) {
  const defaultScope = room?.paint_scope ?? "walls_and_ceiling";

  return (
    <>
      <div>
        <label className="form-label" htmlFor={room ? `room-name-${room.id}` : "room-name"}>Habitación o zona</label>
        <input className="form-input" id={room ? `room-name-${room.id}` : "room-name"} name="name" required defaultValue={room?.name ?? ""} placeholder="Salón, pasillo, dormitorio..." />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink">
          <input type="radio" name="paint_scope" value="walls_and_ceiling" defaultChecked={defaultScope === "walls_and_ceiling"} />
          Techo + paredes
        </label>
        <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink">
          <input type="radio" name="paint_scope" value="ceiling_only" defaultChecked={defaultScope === "ceiling_only"} />
          Solo techo
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <NumberField name="length" label="Largo" defaultValue={room?.length ?? 0} />
        <NumberField name="width" label="Ancho" defaultValue={room?.width ?? 0} />
        <NumberField name="height" label="Alto" defaultValue={room?.height ?? 0} />
        <NumberField name="openings_area" label="Puertas/ventanas" defaultValue={room?.openings_area ?? 0} />
        <NumberField name="unit_price" label="Precio m2" defaultValue={room?.unit_price ?? 6} />
      </div>
      <div>
        <label className="form-label" htmlFor={room ? `room-notes-${room.id}` : "room-notes"}>Notas</label>
        <input className="form-input" id={room ? `room-notes-${room.id}` : "room-notes"} name="notes" defaultValue={room?.notes ?? ""} placeholder="Humedad, remates, color, protección..." />
      </div>
      {room ? (
        <p className="rounded-lg bg-paper p-3 text-sm font-bold text-muted">
          Total actual de la estancia: {calculatedTotal.toFixed(2)} m2
        </p>
      ) : null}
    </>
  );
}

function NumberField({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <div>
      <label className="form-label" htmlFor={name}>{label}</label>
      <input className="form-input" id={name} name={name} type="number" min="0" step="0.01" defaultValue={defaultValue} required />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <span className="block text-xs font-bold uppercase text-muted">{label}</span>
      <strong className="text-base text-ink">{value.toFixed(2)} m2</strong>
    </div>
  );
}
