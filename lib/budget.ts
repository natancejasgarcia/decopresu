import type { BudgetItem } from "@/lib/types";

export function sortBudgetItems(items: BudgetItem[]) {
  return [...items].sort((first, second) => {
    const firstOrder = Number(first.sort_order ?? 0);
    const secondOrder = Number(second.sort_order ?? 0);

    if (firstOrder !== secondOrder && (firstOrder > 0 || secondOrder > 0)) {
      return firstOrder - secondOrder;
    }

    return new Date(first.created_at).getTime() - new Date(second.created_at).getTime();
  });
}
