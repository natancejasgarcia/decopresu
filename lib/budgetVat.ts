import { z } from "zod";

export type BudgetVatRate = 10 | 21;
export const DEFAULT_BUDGET_VAT: BudgetVatRate = 21;
export const budgetVatSchema = z.preprocess(
  (value) =>
    value === null || value === undefined
      ? DEFAULT_BUDGET_VAT
      : typeof value === "string"
        ? Number(value)
        : value,
  z.union([z.literal(10), z.literal(21)]),
);

export function budgetVatTotals(base: number, rate: BudgetVatRate) {
  const vatRate = budgetVatSchema.parse(rate);
  const baseCents = Math.round((base + Number.EPSILON) * 100);
  const vatCents = Math.floor((baseCents * vatRate + 50) / 100);
  return {
    taxableBase: baseCents / 100,
    vat: vatCents / 100,
    total: (baseCents + vatCents) / 100,
  };
}
