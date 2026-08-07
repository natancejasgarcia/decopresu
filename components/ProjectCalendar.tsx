"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectStatus, ProjectType } from "@/lib/types";

export type CalendarProject = {
  id: string;
  name: string;
  client_name: string;
  address: string;
  status: ProjectStatus;
  project_type: ProjectType;
  created_at: string;
};

type ProjectCalendarProps = {
  projects: CalendarProject[];
  initialYear: number;
  initialMonth: number;
};

type CalendarDay = {
  key: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

const STATUS_STYLES: Record<ProjectStatus, { dot: string; pill: string; text: string }> = {
  Pendiente: { dot: "bg-slate-400", pill: "bg-slate-100", text: "text-slate-700" },
  Presupuestado: { dot: "bg-red-400", pill: "bg-red-50", text: "text-red-700" },
  Aprobado: { dot: "bg-emerald-500", pill: "bg-emerald-50", text: "text-emerald-800" },
  "En ejecución": { dot: "bg-blue-500", pill: "bg-blue-50", text: "text-blue-800" },
  Terminado: { dot: "bg-violet-500", pill: "bg-violet-50", text: "text-violet-800" },
  Cobrado: { dot: "bg-teal-500", pill: "bg-teal-50", text: "text-teal-800" },
};

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function ProjectCalendar({ projects, initialYear, initialMonth }: ProjectCalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date(Date.UTC(initialYear, initialMonth, 1)));
  const [selectedKey, setSelectedKey] = useState(() => toDayKey(new Date()));

  const year = viewDate.getUTCFullYear();
  const month = viewDate.getUTCMonth();
  const monthTitle = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(viewDate);
  const days = useMemo(() => buildCalendarDays(year, month), [year, month]);
  const projectsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarProject[]>();

    for (const project of projects) {
      const key = toDayKey(new Date(project.created_at));
      grouped.set(key, [...(grouped.get(key) ?? []), project]);
    }

    return grouped;
  }, [projects]);

  const selectedProjects = projectsByDay.get(selectedKey) ?? [];
  const monthProjects = projects.filter((project) => {
    const createdAt = new Date(project.created_at);
    return createdAt.getUTCFullYear() === year && createdAt.getUTCMonth() === month;
  });

  function moveMonth(offset: number) {
    setViewDate(new Date(Date.UTC(year, month + offset, 1)));
    setSelectedKey(toDayKey(new Date(Date.UTC(year, month + offset, 1))));
  }

  function goToToday() {
    const today = new Date();
    setViewDate(new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1)));
    setSelectedKey(toDayKey(today));
  }

  return (
    <section className="mt-5 rounded-xl border border-line bg-white p-3 shadow-soft sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-moss">
            <CalendarDays size={22} />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-clay">Organizador</p>
            <h2 className="text-xl font-black capitalize text-ink">{monthTitle}</h2>
            <p className="mt-1 text-sm font-semibold text-muted">
              {monthProjects.length} {monthProjects.length === 1 ? "obra disponible" : "obras disponibles"} este mes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink hover:bg-paper" onClick={() => moveMonth(-1)} type="button" aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <button className="h-10 rounded-lg border border-line px-3 text-sm font-black text-ink hover:bg-paper" onClick={goToToday} type="button">
            Hoy
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink hover:bg-paper" onClick={() => moveMonth(1)} type="button" aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 border-l border-t border-line">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="border-b border-r border-line bg-paper py-2 text-center text-xs font-black text-muted sm:py-3 sm:text-sm">
            <span className="sm:hidden">{weekday}</span>
            <span className="hidden sm:inline">{weekdayName(weekday)}</span>
          </div>
        ))}
        {days.map((day) => {
          const dayProjects = projectsByDay.get(day.key) ?? [];
          const isSelected = selectedKey === day.key;

          return (
            <div
              key={day.key}
              className={`min-h-20 border-b border-r border-line p-1.5 sm:min-h-28 sm:p-2 ${day.isCurrentMonth ? "bg-white" : "bg-paper/60"} ${isSelected ? "ring-2 ring-inset ring-moss" : ""}`}
            >
              <button
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black sm:h-8 sm:w-8 sm:text-sm ${day.isToday ? "bg-moss text-white" : day.isCurrentMonth ? "text-ink hover:bg-paper" : "text-muted"}`}
                onClick={() => setSelectedKey(day.key)}
                type="button"
              >
                {day.day}
              </button>
              <div className="mt-1 grid gap-1">
                {dayProjects.slice(0, 2).map((project) => {
                  const tone = STATUS_STYLES[project.status];

                  return (
                    <Link key={project.id} href={`/projects/${project.id}`} className={`hidden truncate rounded px-1.5 py-1 text-left text-[10px] font-black leading-tight sm:block ${tone.pill} ${tone.text}`} title={project.name}>
                      {project.name}
                    </Link>
                  );
                })}
                {dayProjects.length > 0 ? (
                  <button className="flex items-center gap-1 px-1 text-left text-[10px] font-black text-moss sm:hidden" onClick={() => setSelectedKey(day.key)} type="button">
                    <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[dayProjects[0].status].dot}`} />
                    {dayProjects.length > 1 ? `${dayProjects.length} obras` : "1 obra"}
                  </button>
                ) : null}
                {dayProjects.length > 2 ? <span className="hidden px-1 text-[10px] font-black text-muted sm:block">+{dayProjects.length - 2} más</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg bg-paper p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-muted">Agenda del día</p>
            <h3 className="mt-1 text-lg font-black text-ink">{formatDayTitle(selectedKey)}</h3>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-moss ring-1 ring-line">
            {selectedProjects.length} {selectedProjects.length === 1 ? "obra" : "obras"}
          </span>
        </div>
        {selectedProjects.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {selectedProjects.map((project) => {
              const tone = STATUS_STYLES[project.status];

              return (
                <Link key={project.id} href={`/projects/${project.id}`} className="flex items-start justify-between gap-3 rounded-lg bg-white p-3 ring-1 ring-line hover:ring-moss">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-black text-ink">{project.name}</strong>
                    <span className="mt-1 block truncate text-xs font-semibold text-muted">{project.client_name}</span>
                    <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted"><MapPin size={13} />{project.address}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${tone.pill} ${tone.text}`}>{project.status}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-white p-3 text-sm font-semibold text-muted ring-1 ring-line">No hay obras colocadas en este día.</p>
        )}
      </div>
    </section>
  );
}

function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const previousMonthDays = (firstDay.getUTCDay() + 6) % 7;
  const daysInPreviousMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const todayKey = toDayKey(new Date());
  const days: CalendarDay[] = [];

  for (let index = previousMonthDays - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(year, month - 1, daysInPreviousMonth - index));
    days.push({ key: toDayKey(date), day: date.getUTCDate(), isCurrentMonth: false, isToday: toDayKey(date) === todayKey });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    days.push({ key: toDayKey(date), day, isCurrentMonth: true, isToday: toDayKey(date) === todayKey });
  }

  let nextDay = 1;
  while (days.length < 42) {
    const date = new Date(Date.UTC(year, month + 1, nextDay));
    days.push({ key: toDayKey(date), day: nextDay, isCurrentMonth: false, isToday: toDayKey(date) === todayKey });
    nextDay += 1;
  }

  return days;
}

function toDayKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayTitle(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

function weekdayName(short: string) {
  const names: Record<string, string> = { L: "Lun", M: "Mar", X: "Mié", J: "Jue", V: "Vie", S: "Sáb", D: "Dom" };
  return names[short];
}
