import Link from "next/link";
import { CalendarDays, CheckCircle2, FolderKanban, ImagePlus, NotebookPen, RotateCcw, Trash2 } from "lucide-react";
import { createDailyNoteAction, deleteDailyNoteAction, toggleDailyNoteAction } from "@/actions/dailyNoteActions";
import type { DailyNote, Project } from "@/lib/types";

type DailyNotesPanelProps = {
  notes: DailyNote[];
  selectedDate: string;
  availableDates: string[];
  projects: Pick<Project, "id" | "name" | "client_name">[];
};

const timeFormatter = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export function DailyNotesPanel({ notes, selectedDate, availableDates, projects }: DailyNotesPanelProps) {
  const pendingNotes = notes.filter((note) => !note.is_done);
  const doneNotes = notes.filter((note) => note.is_done);
  const previousDate = shiftDate(selectedDate, -1);
  const nextDate = shiftDate(selectedDate, 1);

  return (
    <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
            <NotebookPen size={20} />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-clay">Diario de trabajo</p>
            <h2 className="text-xl font-black text-ink">Apuntes del dia</h2>
            <p className="text-sm font-semibold text-muted">Guarda lo que se ha hecho, avisos, incidencias y recordatorios por fecha.</p>
          </div>
        </div>
        <span className="inline-flex h-9 items-center rounded-full bg-paper px-3 text-sm font-black text-ink">
          {notes.length} apuntes
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-paper p-3">
        <form className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto]" method="get">
          <Link className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-black text-ink" href={`/notes?date=${previousDate}`}>
            Dia anterior
          </Link>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
            <CalendarDays size={18} className="text-moss" />
            <input className="w-full bg-transparent text-sm font-black text-ink outline-none" type="date" name="date" defaultValue={selectedDate} />
          </label>
          <button className="h-11 rounded-lg bg-ink px-4 text-sm font-black text-white" type="submit">
            Ver fecha
          </button>
          <Link className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-black text-ink" href={`/notes?date=${nextDate}`}>
            Dia siguiente
          </Link>
        </form>
        <p className="mt-2 text-sm font-semibold text-muted">
          Viendo {formatDateLabel(selectedDate)}
        </p>
      </div>

      <form action={createDailyNoteAction} className="mt-4 grid gap-2" encType="multipart/form-data">
        <input type="hidden" name="note_date" value={selectedDate} />
        <select className="form-input" name="project_id" defaultValue="">
          <option value="">Sin obra vinculada</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} - {project.client_name}
            </option>
          ))}
        </select>
        <textarea
          className="form-input min-h-28"
          name="text"
          placeholder="Ej: Hoy se ha preparado el salon, tapado suelo, reparado grietas y queda pendiente dar segunda mano..."
          maxLength={2000}
          required
        />
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 text-sm font-black text-ink">
          <span className="inline-flex items-center gap-2">
            <ImagePlus size={18} className="text-moss" />
            Fotos de la nota
          </span>
          <input className="max-w-[190px] text-xs font-bold text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-moss file:px-3 file:py-2 file:font-black file:text-white" name="photos" type="file" accept="image/*" multiple />
        </label>
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-5 font-black text-white" type="submit">
          <NotebookPen size={18} />
          Guardar apunte
        </button>
      </form>

      <div className="mt-4 grid gap-2">
        {notes.length === 0 ? (
          <div className="rounded-lg bg-paper p-4 text-sm font-semibold text-muted">
            No hay apuntes guardados para esta fecha.
          </div>
        ) : (
          <>
            {pendingNotes.map((note) => (
              <DailyNoteRow key={note.id} note={note} selectedDate={selectedDate} />
            ))}
            {doneNotes.length > 0 ? (
              <div className="mt-2 border-t border-line pt-3">
                <p className="mb-2 text-xs font-black uppercase text-muted">Archivados</p>
                <div className="grid gap-2">
                  {doneNotes.map((note) => (
                    <DailyNoteRow key={note.id} note={note} selectedDate={selectedDate} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {availableDates.length > 0 ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs font-black uppercase text-muted">Dias con apuntes</p>
          <div className="flex flex-wrap gap-2">
            {availableDates.slice(0, 16).map((date) => (
              <Link
                key={date}
                href={`/notes?date=${date}`}
                className={`rounded-full px-3 py-2 text-xs font-black ${date === selectedDate ? "bg-moss text-white" : "bg-paper text-ink"}`}
              >
                {formatShortDate(date)}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DailyNoteRow({ note, selectedDate }: { note: DailyNote; selectedDate: string }) {
  const createdAt = new Date(note.created_at);

  return (
    <article className={`rounded-lg border p-3 ${note.is_done ? "border-line bg-paper/70 text-muted" : "border-line bg-white"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {note.project_id ? (
            <Link
              href={`/projects/${note.project_id}`}
              className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-moss"
            >
              <FolderKanban size={14} />
              <span className="truncate">
                {note.project_name ?? "Obra vinculada"}
                {note.project_client_name ? ` - ${note.project_client_name}` : ""}
              </span>
            </Link>
          ) : null}
          <p className={`whitespace-pre-wrap text-sm font-bold ${note.is_done ? "line-through decoration-2" : "text-ink"}`}>
            {note.text}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted">
            {note.author_name ?? "Decoralia"} - {timeFormatter.format(createdAt)}
          </p>
          {note.files && note.files.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {note.files.map((file) => (
                <a
                  key={file.id}
                  href={file.signed_url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-line bg-paper"
                  title={file.file_name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={file.signed_url} alt={file.file_name} className="aspect-square w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <form action={toggleDailyNoteAction}>
            <input type="hidden" name="note_id" value={note.id} />
            <input type="hidden" name="note_date" value={selectedDate} />
            <input type="hidden" name="is_done" value={note.is_done ? "false" : "true"} />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink"
              type="submit"
            >
              {note.is_done ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
              {note.is_done ? "Reabrir" : "Archivar"}
            </button>
          </form>
          <form action={deleteDailyNoteAction}>
            <input type="hidden" name="note_id" value={note.id} />
            <input type="hidden" name="note_date" value={selectedDate} />
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

function shiftDate(date: string, days: number) {
  const nextDate = new Date(`${date}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function formatDateLabel(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00`));
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
}
