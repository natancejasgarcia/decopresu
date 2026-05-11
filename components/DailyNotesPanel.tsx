import { CheckCircle2, NotebookPen, RotateCcw, Trash2 } from "lucide-react";
import { createDailyNoteAction, deleteDailyNoteAction, toggleDailyNoteAction } from "@/actions/dailyNoteActions";
import type { DailyNote } from "@/lib/types";

type DailyNotesPanelProps = {
  notes: DailyNote[];
};

const timeFormatter = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
});

export function DailyNotesPanel({ notes }: DailyNotesPanelProps) {
  const pendingNotes = notes.filter((note) => !note.is_done);
  const doneNotes = notes.filter((note) => note.is_done);

  return (
    <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
            <NotebookPen size={20} />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-clay">Notas de hoy</p>
            <h2 className="text-xl font-black text-ink">Tareas y avisos del dia</h2>
            <p className="text-sm font-semibold text-muted">Notas compartidas para Jose Antonio y Padre.</p>
          </div>
        </div>
        <span className="inline-flex h-9 items-center rounded-full bg-paper px-3 text-sm font-black text-ink">
          {pendingNotes.length} pendientes
        </span>
      </div>

      <form action={createDailyNoteAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className="form-input h-12 py-0"
          name="text"
          placeholder="Ej: llamar a Clara, comprar pintura, revisar presupuesto..."
          maxLength={500}
          required
        />
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-5 font-black text-white" type="submit">
          <NotebookPen size={18} />
          Anadir nota
        </button>
      </form>

      <div className="mt-4 grid gap-2">
        {notes.length === 0 ? (
          <div className="rounded-lg bg-paper p-4 text-sm font-semibold text-muted">
            No hay notas para hoy.
          </div>
        ) : (
          <>
            {pendingNotes.map((note) => (
              <DailyNoteRow key={note.id} note={note} />
            ))}
            {doneNotes.length > 0 ? (
              <div className="mt-2 border-t border-line pt-3">
                <p className="mb-2 text-xs font-black uppercase text-muted">Listas</p>
                <div className="grid gap-2">
                  {doneNotes.map((note) => (
                    <DailyNoteRow key={note.id} note={note} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function DailyNoteRow({ note }: { note: DailyNote }) {
  const createdAt = new Date(note.created_at);

  return (
    <article className={`rounded-lg border p-3 ${note.is_done ? "border-line bg-paper/70 text-muted" : "border-line bg-white"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={`whitespace-pre-wrap text-sm font-bold ${note.is_done ? "line-through decoration-2" : "text-ink"}`}>
            {note.text}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted">
            {note.author_name ?? "Decoralia"} - {timeFormatter.format(createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <form action={toggleDailyNoteAction}>
            <input type="hidden" name="note_id" value={note.id} />
            <input type="hidden" name="is_done" value={note.is_done ? "false" : "true"} />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink"
              type="submit"
            >
              {note.is_done ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
              {note.is_done ? "Reabrir" : "Listo"}
            </button>
          </form>
          <form action={deleteDailyNoteAction}>
            <input type="hidden" name="note_id" value={note.id} />
            <button
              className="grid h-10 w-10 place-items-center rounded-lg border border-red-100 bg-red-50 text-red-700"
              type="submit"
              aria-label="Borrar nota"
              title="Borrar nota"
            >
              <Trash2 size={16} />
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
