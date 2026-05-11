import { CheckCircle2 } from "lucide-react";
import { dismissTodayItemAction } from "@/actions/dashboardActions";

export type TodayCard = {
  key: string;
  title: string;
  value: string;
  detail: string;
  tone: "moss" | "red" | "blue" | "clay";
};

type TodayPanelProps = {
  cards: TodayCard[];
};

const TONE_CLASSES: Record<TodayCard["tone"], string> = {
  moss: "bg-emerald-50 text-emerald-800 border-emerald-100",
  red: "bg-red-50 text-red-700 border-red-100",
  blue: "bg-blue-50 text-blue-800 border-blue-100",
  clay: "bg-orange-50 text-orange-800 border-orange-100",
};

export function TodayPanel({ cards }: TodayPanelProps) {
  if (cards.length === 0) {
    return (
      <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-clay">Hoy</p>
            <h2 className="text-lg font-black text-ink">Todo controlado</h2>
            <p className="text-sm font-semibold text-muted">No hay avisos importantes para este filtro.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-5">
      <div className="mb-3">
        <p className="text-xs font-black uppercase text-clay">Hoy</p>
        <h2 className="text-xl font-black text-ink">Lo que pide atención</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.key} className={`rounded-lg border p-4 shadow-soft ${TONE_CLASSES[card.tone]}`}>
            <p className="text-xs font-black uppercase opacity-80">{card.title}</p>
            <strong className="mt-1 block text-2xl text-ink">{card.value}</strong>
            <p className="mt-1 min-h-10 text-sm font-semibold opacity-85">{card.detail}</p>
            <form action={dismissTodayItemAction} className="mt-3">
              <input type="hidden" name="item_key" value={card.key} />
              <button className="h-10 rounded-lg bg-white/85 px-4 text-sm font-black text-ink ring-1 ring-black/5" type="submit">
                Listo
              </button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
