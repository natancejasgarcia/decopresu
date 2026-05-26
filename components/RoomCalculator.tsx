"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Pencil, Plus, Ruler, Trash2, X } from "lucide-react";
import {
  createRoomAction,
  createRoomModuleAction,
  deleteRoomAction,
  deleteRoomModuleAction,
  updateRoomAction,
  updateRoomModuleAction,
} from "@/actions/roomActions";
import { calculateRoomAreas, formatCurrency } from "@/lib/calculations";
import type { Room, RoomModule, RoomModuleType, RoomPaintScope } from "@/lib/types";

type RoomCalculatorProps = {
  projectId: string;
  rooms: Room[];
};

type PreviewState = {
  length: number;
  width: number;
  height: number;
  openingsArea: number;
  manualArea: number;
  paintScope: RoomPaintScope;
};

const MODULE_TYPES: Array<{ value: RoomModuleType; label: string; defaultConcept: string; defaultUnit: string }> = [
  { value: "ceiling_only", label: "Solo techo", defaultConcept: "Techo", defaultUnit: "m2" },
  { value: "walls_only", label: "Solo paredes", defaultConcept: "Paredes", defaultUnit: "m2" },
  { value: "manual_area", label: "Metro cuadrado", defaultConcept: "Metros adicionales", defaultUnit: "m2" },
  { value: "free", label: "Libre", defaultConcept: "", defaultUnit: "m2" },
];

export function RoomCalculator({ projectId, rooms }: RoomCalculatorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [addingModuleRoomId, setAddingModuleRoomId] = useState<string | null>(null);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({
    length: 0,
    width: 0,
    height: 0,
    openingsArea: 0,
    manualArea: 0,
    paintScope: "walls_and_ceiling",
  });
  const calculated = calculateRoomAreas(preview);
  const projectTotal = useMemo(
    () => rooms.reduce((total, room) => total + Number(room.total_paintable_area) + getRoomModulesArea(room), 0),
    [rooms],
  );
  const projectEstimate = useMemo(
    () => rooms.reduce((total, room) => total + getRoomBaseTotal(room) + getRoomModulesTotal(room), 0),
    [rooms],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await createRoomAction(formData);
      form.reset();
      setPreview({ length: 0, width: 0, height: 0, openingsArea: 0, manualArea: 0, paintScope: "walls_and_ceiling" });
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

  function handleModuleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await createRoomModuleAction(formData);
      form.reset();
      setAddingModuleRoomId(null);
      router.refresh();
    });
  }

  function handleModuleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await updateRoomModuleAction(formData);
      setEditingModuleId(null);
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

  function handleModuleDelete(roomId: string, moduleId: string) {
    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("room_id", roomId);
    formData.set("module_id", moduleId);
    startTransition(async () => {
      await deleteRoomModuleAction(formData);
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
      manualArea: Number(formData.get("manual_area") || 0),
      paintScope: String(formData.get("paint_scope") || "walls_and_ceiling") as RoomPaintScope,
    });
  }

  const isManualPreview = preview.paintScope === "manual_area";

  return (
    <section className="section-panel">
      <div className="section-heading">
        <div>
          <h2>Plano por habitaciones</h2>
          <p className="mt-1 text-sm font-semibold text-muted">Primero crea una habitacion o zona. Despues, dentro de esa tarjeta, podras anadir modulos: techo, paredes, m2 o libre.</p>
        </div>
        <span className="rounded-full bg-paper px-3 py-1 text-sm font-black text-moss">
          {projectTotal.toFixed(2)} m2
        </span>
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-3">
        <p className="text-xs font-black uppercase text-muted">Valor del proyecto por habitaciones</p>
        <strong className="mt-1 block text-2xl text-ink">{formatCurrency(projectEstimate)}</strong>
        <p className="mt-1 text-sm font-bold text-muted">
          {projectTotal.toFixed(2)} m2 calculados con habitaciones y modulos - IVA no incluido
        </p>
      </div>

      <form onSubmit={handleSubmit} onChange={(event) => updatePreview(event.currentTarget)} className="grid gap-3 rounded-lg bg-paper p-3">
        <input type="hidden" name="project_id" value={projectId} />
        <RoomFields />
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {isManualPreview ? (
            <>
              <Metric label="M2 introducidos" value={calculated.manualArea} />
              <Metric label="Total estancia" value={calculated.totalPaintableArea} />
            </>
          ) : (
            <>
              <Metric label="Techo" value={calculated.ceilingArea} />
              <Metric label="Paredes" value={calculated.wallArea} />
              <Metric label="Descuento" value={preview.paintScope === "ceiling_only" ? 0 : calculated.openingsArea} />
              <Metric label="Total estancia" value={calculated.totalPaintableArea} />
            </>
          )}
        </div>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60" disabled={isPending}>
          <Ruler size={18} />
          Anadir habitacion o zona
        </button>
      </form>

      <div className="mt-5 grid gap-3">
        {rooms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-paper p-4">
            <p className="text-sm font-black text-ink">Aun no hay habitaciones o zonas.</p>
            <p className="mt-1 text-sm font-semibold text-muted">
              Anade una habitacion arriba. Cuando se cree, aparecera aqui su tarjeta con el boton <strong>Anadir modulo</strong> para meter subpartes como libre, solo techo, solo paredes o metros directos.
            </p>
          </div>
        ) : (
          rooms.map((room) => {
            const roomTotal = Number(room.total_paintable_area);
            const roomPrice = Number(room.unit_price ?? 0);
            const modules = room.modules ?? [];
            const modulesTotal = getRoomModulesTotal(room);
            const roomGrandTotal = getRoomBaseTotal(room) + modulesTotal;
            const isCeilingOnly = room.paint_scope === "ceiling_only";
            const isManualArea = room.paint_scope === "manual_area";
            const isWallsOnly = room.paint_scope === "walls_only";
            const scopeLabel = isManualArea ? "Metro cuadrado" : isCeilingOnly ? "Solo techo" : isWallsOnly ? "Solo paredes" : "Techo + paredes";

            if (editingRoomId === room.id) {
              return (
                <form key={room.id} onSubmit={handleEditSubmit} className="grid gap-3 rounded-lg border border-moss bg-white p-3">
                  <input type="hidden" name="project_id" value={projectId} />
                  <input type="hidden" name="room_id" value={room.id} />
                  <RoomFields room={room} />
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
                      <span className="rounded-full bg-paper px-2 py-1 text-xs font-black text-steel">{scopeLabel}</span>
                      {modules.length > 0 ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-moss">{modules.length} modulos</span>
                      ) : null}
                    </div>
                    {room.notes ? <p className="mt-1 text-sm text-muted">{room.notes}</p> : null}
                  </div>
                  <div className="text-right">
                    <strong className="block text-lg text-moss">{formatCurrency(roomGrandTotal)}</strong>
                    <span className="text-sm font-bold text-muted">{roomTotal.toFixed(2)} m2 base</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-5">
                  {isManualArea ? (
                    <>
                      <span>M2 directos {Number(room.manual_area ?? roomTotal).toFixed(2)}</span>
                      <span>Sin medidas de lados</span>
                    </>
                  ) : (
                    <>
                      <span>Techo {Number(room.ceiling_area).toFixed(2)} m2</span>
                      <span>Paredes {Number(room.wall_area).toFixed(2)} m2</span>
                      <span>Descuento {isCeilingOnly ? "0.00" : Number(room.openings_area).toFixed(2)} m2</span>
                      <span>{room.length} x {room.width} x {room.height} m</span>
                    </>
                  )}
                  <span>{formatCurrency(roomPrice)} / m2</span>
                </div>

                <div className="mt-3 rounded-lg bg-paper p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-black uppercase text-muted">Subpartes de esta partida</p>
                      <p className="text-sm font-bold text-ink">Todo esto saldra agrupado dentro de {room.name}</p>
                    </div>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-moss px-3 text-sm font-black text-white"
                      type="button"
                      onClick={() => setAddingModuleRoomId((current) => (current === room.id ? null : room.id))}
                    >
                      <Plus size={16} />
                      Anadir modulo
                    </button>
                  </div>

                  {addingModuleRoomId === room.id ? (
                    <form onSubmit={handleModuleSubmit} className="mt-3 grid gap-3 rounded-lg border border-line bg-white p-3">
                      <input type="hidden" name="project_id" value={projectId} />
                      <input type="hidden" name="room_id" value={room.id} />
                      <ModuleFields />
                      <div className="flex gap-2">
                        <button className="h-10 flex-1 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60" disabled={isPending}>
                          Guardar modulo
                        </button>
                        <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink" type="button" onClick={() => setAddingModuleRoomId(null)}>
                          <X size={18} />
                        </button>
                      </div>
                    </form>
                  ) : null}

                  <div className="mt-3 grid gap-2">
                    {modules.length === 0 ? (
                      <p className="rounded-lg bg-white p-3 text-sm font-semibold text-muted">No hay modulos dentro de esta habitacion.</p>
                    ) : (
                      modules.map((module) =>
                        editingModuleId === module.id ? (
                          <form key={module.id} onSubmit={handleModuleEditSubmit} className="grid gap-3 rounded-lg border border-moss bg-white p-3">
                            <input type="hidden" name="project_id" value={projectId} />
                            <input type="hidden" name="room_id" value={room.id} />
                            <input type="hidden" name="module_id" value={module.id} />
                            <ModuleFields module={module} />
                            <div className="flex gap-2">
                              <button className="h-10 flex-1 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60" disabled={isPending}>
                                Guardar modulo
                              </button>
                              <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink" type="button" onClick={() => setEditingModuleId(null)}>
                                <X size={18} />
                              </button>
                            </div>
                          </form>
                        ) : (
                          <ModuleRow
                            key={module.id}
                            module={module}
                            isPending={isPending}
                            onEdit={() => setEditingModuleId(module.id)}
                            onDelete={() => handleModuleDelete(room.id, module.id)}
                          />
                        ),
                      )
                    )}
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-black text-ink" type="button" onClick={() => setEditingRoomId(room.id)}>
                    <Pencil size={16} />
                    Editar zona
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

function RoomFields({ room }: { room?: Room }) {
  const defaultScope = room?.paint_scope ?? "walls_and_ceiling";
  const [scope, setScope] = useState<RoomPaintScope>(defaultScope);
  const idPrefix = room?.id ?? "new";
  const isManualArea = scope === "manual_area";

  return (
    <>
      <div>
        <label className="form-label" htmlFor={`room-name-${idPrefix}`}>Habitacion o zona</label>
        <input className="form-input" id={`room-name-${idPrefix}`} name="name" required defaultValue={room?.name ?? ""} placeholder="Salon, pasillo, dormitorio, fachada..." />
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <ScopeOption name="paint_scope" value="walls_and_ceiling" checked={scope === "walls_and_ceiling"} onChange={() => setScope("walls_and_ceiling")} label="Techo + paredes" />
        <ScopeOption name="paint_scope" value="ceiling_only" checked={scope === "ceiling_only"} onChange={() => setScope("ceiling_only")} label="Solo techo" />
        <ScopeOption name="paint_scope" value="walls_only" checked={scope === "walls_only"} onChange={() => setScope("walls_only")} label="Solo paredes" />
        <ScopeOption name="paint_scope" value="manual_area" checked={scope === "manual_area"} onChange={() => setScope("manual_area")} label="Metro cuadrado" />
      </div>

      {isManualArea ? (
        <>
          <input type="hidden" name="length" value="1" />
          <input type="hidden" name="width" value="1" />
          <input type="hidden" name="height" value="1" />
          <input type="hidden" name="openings_area" value="0" />
          <div className="grid grid-cols-2 gap-3">
            <NumberField name="manual_area" label="M2" defaultValue={room?.manual_area ?? room?.total_paintable_area ?? 0} />
            <NumberField name="unit_price" label="Precio m2" defaultValue={room?.unit_price ?? 6} />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="manual_area" value="0" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <NumberField name="length" label="Largo" defaultValue={room?.length ?? 0} />
            <NumberField name="width" label="Ancho" defaultValue={room?.width ?? 0} />
            <NumberField name="height" label="Alto" defaultValue={room?.height ?? 0} />
            <NumberField name="openings_area" label="Puertas/ventanas" defaultValue={room?.openings_area ?? 0} />
            <NumberField name="unit_price" label="Precio m2" defaultValue={room?.unit_price ?? 6} />
          </div>
        </>
      )}

      <div>
        <label className="form-label" htmlFor={`room-notes-${idPrefix}`}>Notas</label>
        <input className="form-input" id={`room-notes-${idPrefix}`} name="notes" defaultValue={room?.notes ?? ""} placeholder="Humedad, remates, color, proteccion..." />
      </div>
    </>
  );
}

function ModuleFields({ module }: { module?: RoomModule }) {
  const defaultType = module?.module_type ?? "free";
  const [moduleType, setModuleType] = useState<RoomModuleType>(defaultType);
  const selected = MODULE_TYPES.find((item) => item.value === moduleType) ?? MODULE_TYPES[3];

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-4">
        {MODULE_TYPES.map((item) => (
          <label key={item.value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-black ${moduleType === item.value ? "border-moss bg-white text-moss" : "border-line bg-paper text-ink"}`}>
            <input
              type="radio"
              name="module_type"
              value={item.value}
              checked={moduleType === item.value}
              onChange={() => setModuleType(item.value)}
            />
            {item.label}
          </label>
        ))}
      </div>
      <div>
        <label className="form-label" htmlFor={`module-concept-${module?.id ?? "new"}`}>Concepto del modulo</label>
        <input
          className="form-input"
          id={`module-concept-${module?.id ?? "new"}`}
          name="concept"
          required
          defaultValue={module?.concept ?? selected.defaultConcept}
          placeholder={moduleType === "free" ? "Ej: Rodapie, reparacion, materiales, radiador..." : selected.defaultConcept}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <PositiveNumberField name="quantity" label="Cantidad" defaultValue={module?.quantity ?? 1} />
        <div>
          <label className="form-label" htmlFor={`module-unit-${module?.id ?? "new"}`}>Unidad</label>
          <input className="form-input" id={`module-unit-${module?.id ?? "new"}`} name="unit" defaultValue={module?.unit ?? selected.defaultUnit} placeholder="m2, ml, ud..." required />
        </div>
        <NumberField name="unit_price" label="Precio" defaultValue={module?.unit_price ?? 0} />
      </div>
      <div>
        <label className="form-label" htmlFor={`module-notes-${module?.id ?? "new"}`}>Notas del modulo</label>
        <input className="form-input" id={`module-notes-${module?.id ?? "new"}`} name="notes" defaultValue={module?.notes ?? ""} placeholder="Detalle, acabado, color, material..." />
      </div>
    </>
  );
}

function ModuleRow({
  module,
  isPending,
  onEdit,
  onDelete,
}: {
  module: RoomModule;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-ink">{module.concept}</strong>
            <span className="rounded-full bg-paper px-2 py-1 text-xs font-black text-steel">{getModuleTypeLabel(module.module_type)}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-muted">
            {Number(module.quantity)} {module.unit} x {formatCurrency(Number(module.unit_price))}
          </p>
          {module.notes ? <p className="mt-1 text-sm text-muted">{module.notes}</p> : null}
        </div>
        <strong className="shrink-0 text-moss">{formatCurrency(Number(module.total))}</strong>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-black text-ink" type="button" onClick={onEdit}>
          <Pencil size={15} />
          Editar
        </button>
        <button className="grid h-9 w-9 place-items-center rounded-lg border border-red-100 bg-red-50 text-red-700 disabled:opacity-60" type="button" disabled={isPending} onClick={onDelete} title="Borrar modulo" aria-label="Borrar modulo">
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function ScopeOption({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: RoomPaintScope;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-black ${checked ? "border-moss bg-white text-moss" : "border-line bg-white text-ink"}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      {label}
    </label>
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

function PositiveNumberField({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <div>
      <label className="form-label" htmlFor={name}>{label}</label>
      <input className="form-input" id={name} name={name} type="number" min="0.01" step="0.01" defaultValue={defaultValue} required />
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

function getRoomBaseTotal(room: Room) {
  return Number(room.total_paintable_area) * Number(room.unit_price ?? 0);
}

function getRoomModulesTotal(room: Room) {
  return (room.modules ?? []).reduce((sum, module) => sum + Number(module.total), 0);
}

function getRoomModulesArea(room: Room) {
  return (room.modules ?? [])
    .filter((module) => module.unit.toLowerCase() === "m2")
    .reduce((sum, module) => sum + Number(module.quantity), 0);
}

function getModuleTypeLabel(moduleType: RoomModuleType) {
  if (moduleType === "ceiling_only") return "Solo techo";
  if (moduleType === "walls_only") return "Solo paredes";
  if (moduleType === "manual_area") return "Metro cuadrado";
  return "Libre";
}
