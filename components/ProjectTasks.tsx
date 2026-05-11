"use client";

import { FormEvent, useRef, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { createTaskAction, deleteTaskAction, toggleTaskAction } from "@/actions/taskActions";
import type { ProjectTask } from "@/lib/types";

type ProjectTasksProps = {
  projectId: string;
  tasks: ProjectTask[];
};

export function ProjectTasks({ projectId, tasks }: ProjectTasksProps) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const openTasks = tasks.filter((task) => !task.is_done);
  const doneTasks = tasks.filter((task) => task.is_done);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await createTaskAction(formData);
      formRef.current?.reset();
    });
  }

  function handleToggle(task: ProjectTask, isDone: boolean) {
    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("task_id", task.id);
    formData.set("is_done", String(isDone));
    startTransition(async () => {
      await toggleTaskAction(formData);
    });
  }

  function handleDelete(task: ProjectTask) {
    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("task_id", task.id);
    startTransition(async () => {
      await deleteTaskAction(formData);
    });
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <div>
          <h2>Tareas</h2>
          <p className="mt-1 text-sm font-semibold text-muted">{openTasks.length} pendientes · {doneTasks.length} hechas</p>
        </div>
      </div>

      <form ref={formRef} onSubmit={handleCreate} className="grid gap-3 rounded-lg bg-paper p-3 md:grid-cols-[1fr_180px_auto]">
        <input type="hidden" name="project_id" value={projectId} />
        <div>
          <label className="form-label" htmlFor="task-title">Tarea</label>
          <input className="form-input" id="task-title" name="title" required placeholder="Llamar cliente, comprar pintura, enviar presupuesto..." />
        </div>
        <div>
          <label className="form-label" htmlFor="task-due-date">Fecha</label>
          <input className="form-input" id="task-due-date" name="due_date" type="date" />
        </div>
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white md:mt-6" disabled={isPending}>
          <Plus size={18} />
          Añadir
        </button>
      </form>

      <div className="mt-4 grid gap-3">
        {tasks.length === 0 ? (
          <p className="rounded-lg bg-paper p-4 text-sm font-semibold text-muted">Añade tareas para saber qué falta en esta obra.</p>
        ) : null}

        {openTasks.map((task) => (
          <TaskRow key={task.id} task={task} disabled={isPending} onToggle={() => handleToggle(task, true)} onDelete={() => handleDelete(task)} />
        ))}

        {doneTasks.length > 0 ? (
          <div className="mt-2 rounded-lg bg-paper p-3">
            <p className="mb-2 text-xs font-black uppercase text-muted">Hechas</p>
            <div className="grid gap-2">
              {doneTasks.map((task) => (
                <TaskRow key={task.id} task={task} done disabled={isPending} onToggle={() => handleToggle(task, false)} onDelete={() => handleDelete(task)} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  done = false,
  disabled,
  onToggle,
  onDelete,
}: {
  task: ProjectTask;
  done?: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-3 ${done ? "opacity-70" : ""}`}>
      <button
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${done ? "border-moss bg-moss text-white" : "border-line text-muted"}`}
        disabled={disabled}
        onClick={onToggle}
        type="button"
      >
        <Check size={17} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`font-black text-ink ${done ? "line-through" : ""}`}>{task.title}</p>
        {task.due_date ? <p className="mt-1 text-xs font-bold text-muted">Fecha: {formatShortDate(task.due_date)}</p> : null}
      </div>
      <button className="grid h-9 w-9 place-items-center rounded-lg border border-line text-red-700" disabled={disabled} onClick={onDelete} type="button">
        <Trash2 size={16} />
      </button>
    </article>
  );
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(new Date(value));
}
