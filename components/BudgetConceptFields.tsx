"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  findBudgetConceptSuggestions,
  type BudgetConceptSuggestion,
} from "@/lib/budgetConcepts";

type Props = {
  id: string;
  catalog: BudgetConceptSuggestion[];
  initialConcept?: string;
  initialNotes?: string;
};

export function BudgetConceptFields({
  id,
  catalog,
  initialConcept = "",
  initialNotes = "",
}: Props) {
  const [concept, setConcept] = useState(initialConcept);
  const [notes, setNotes] = useState(initialNotes);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(
    () => findBudgetConceptSuggestions(catalog, concept),
    [catalog, concept],
  );
  const expanded = open && suggestions.length > 0;
  const listId = `${id}-suggestions`;

  useEffect(() => {
    if (expanded && active >= 0) {
      listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [expanded, active]);

  function choose(item: BudgetConceptSuggestion) {
    setConcept(item.concept);
    setNotes(item.notes);
    setOpen(false);
    setActive(-1);
  }

  return (
    <>
      <div className="relative min-w-0">
        <label className="form-label" htmlFor={id}>
          Concepto
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            className="form-input pr-12"
            id={id}
            name="concept"
            value={concept}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={
              expanded && active >= 0 ? `${listId}-${active}` : undefined
            }
            autoComplete="off"
            placeholder="Pintura paredes, materiales, mano de obra..."
            required
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setActive(-1);
            }}
            onChange={(event) => {
              setConcept(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                setActive(-1);
              }
              if (
                (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                suggestions.length
              ) {
                event.preventDefault();
                setOpen(true);
                setActive(
                  event.key === "ArrowDown"
                    ? (active + 1) % suggestions.length
                    : active <= 0
                      ? suggestions.length - 1
                      : active - 1,
                );
              }
              if (event.key === "Enter" && expanded) {
                event.preventDefault();
                if (active >= 0 && suggestions[active])
                  choose(suggestions[active]);
                else setOpen(false);
              }
            }}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-moss"
            aria-label="Mostrar conceptos"
            title="Mostrar conceptos"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              inputRef.current?.focus();
              setOpen(!open);
              setActive(-1);
            }}
          >
            <ChevronDown size={20} aria-hidden />
          </button>
        </div>
        {expanded ? (
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Conceptos de presupuesto"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-soft"
          >
            {suggestions.map((item, index) => (
              <button
                key={item.concept}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active === index}
                tabIndex={-1}
                type="button"
                className={`block min-h-12 w-full break-words border-b border-line px-3 py-3 text-left last:border-b-0 hover:bg-paper ${active === index ? "bg-paper" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span className="block font-bold text-ink">{item.concept}</span>
                <span className="mt-1 line-clamp-2 block text-sm text-muted">
                  {item.notes}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <label className="form-label" htmlFor={`${id}-notes`}>
          Notas del concepto
        </label>
        <textarea
          className="form-input min-h-28"
          id={`${id}-notes`}
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Detalle del trabajo, acabado, materiales o condiciones..."
        />
      </div>
    </>
  );
}
