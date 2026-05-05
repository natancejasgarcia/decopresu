"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Ruler } from "lucide-react";
import { createRoomAction } from "@/actions/roomActions";
import { calculateRoomAreas, formatCurrency } from "@/lib/calculations";
import type { Room } from "@/lib/types";

type RoomCalculatorProps = {
  projectId: string;
  rooms: Room[];
};

export function RoomCalculator({ projectId, rooms }: RoomCalculatorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pricePerMeter, setPricePerMeter] = useState(6);
  const [preview, setPreview] = useState({ length: 0, width: 0, height: 0, openingsArea: 0 });
  const calculated = calculateRoomAreas(preview);
  const projectTotal = useMemo(
    () => rooms.reduce((total, room) => total + Number(room.total_paintable_area), 0),
    [rooms],
  );
  const projectEstimate = projectTotal * pricePerMeter;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await createRoomAction(formData);
      form.reset();
      setPreview({ length: 0, width: 0, height: 0, openingsArea: 0 });
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
    });
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <div>
          <h2>Plano por habitaciones</h2>
          <p className="mt-1 text-sm font-semibold text-muted">Mete las medidas de cada estancia y calcula techo, paredes y total pintable.</p>
        </div>
        <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-moss">
          {projectTotal.toFixed(2)} m2
        </span>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-3 sm:grid-cols-[1fr_180px] sm:items-end">
        <div>
          <p className="text-xs font-black uppercase text-muted">Valor del proyecto por m2</p>
          <strong className="mt-1 block text-2xl text-ink">{formatCurrency(projectEstimate)}</strong>
          <p className="mt-1 text-sm font-bold text-muted">
            {projectTotal.toFixed(2)} m2 x {formatCurrency(pricePerMeter)} / m2 · IVA no incluido
          </p>
        </div>
        <div>
          <label className="form-label" htmlFor="measurement-price">Precio por m2</label>
          <input
            className="form-input"
            id="measurement-price"
            type="number"
            min="0"
            step="0.01"
            value={pricePerMeter}
            onChange={(event) => setPricePerMeter(Number(event.target.value) || 0)}
          />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        onChange={(event) => updatePreview(event.currentTarget)}
        className="grid gap-3 rounded-lg bg-paper p-3"
      >
        <input type="hidden" name="project_id" value={projectId} />
        <div>
          <label className="form-label" htmlFor="room-name">Habitación o zona</label>
          <input className="form-input" id="room-name" name="name" required placeholder="Salón, pasillo, dormitorio..." />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField name="length" label="Largo" />
          <NumberField name="width" label="Ancho" />
          <NumberField name="height" label="Alto" />
          <NumberField name="openings_area" label="Puertas/ventanas" />
        </div>
        <div>
          <label className="form-label" htmlFor="room-notes">Notas</label>
          <input className="form-input" id="room-notes" name="notes" placeholder="Humedad, remates, color, protección..." />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Metric label="Techo" value={calculated.ceilingArea} />
          <Metric label="Paredes" value={calculated.wallArea} />
          <Metric label="Descuento" value={calculated.openingsArea} />
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
            return (
              <article key={room.id} className="rounded-lg border border-line bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-ink">{room.name}</h3>
                    {room.notes ? <p className="mt-1 text-sm text-muted">{room.notes}</p> : null}
                  </div>
                  <div className="text-right">
                    <strong className="block text-lg text-moss">{roomTotal.toFixed(2)} m2</strong>
                    <span className="text-sm font-bold text-muted">{formatCurrency(roomTotal * pricePerMeter)}</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4">
                  <span>Techo {Number(room.ceiling_area).toFixed(2)} m2</span>
                  <span>Paredes {Number(room.wall_area).toFixed(2)} m2</span>
                  <span>Descuento {Number(room.openings_area).toFixed(2)} m2</span>
                  <span>{room.length} x {room.width} x {room.height} m</span>
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

function NumberField({ name, label }: { name: string; label: string }) {
  return (
    <div>
      <label className="form-label" htmlFor={name}>{label}</label>
      <input className="form-input" id={name} name={name} type="number" min="0" step="0.01" defaultValue="0" required />
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
