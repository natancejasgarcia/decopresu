export type RoomInput = {
  length: number;
  width: number;
  height: number;
  openingsArea: number;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function calculateRoomAreas(input: RoomInput) {
  const ceilingArea = input.length * input.width;
  const wallArea = 2 * (input.length + input.width) * input.height;
  const totalPaintableArea = Math.max(ceilingArea + wallArea - input.openingsArea, 0);

  return {
    ceilingArea: roundMoney(ceilingArea),
    wallArea: roundMoney(wallArea),
    openingsArea: roundMoney(input.openingsArea),
    totalPaintableArea: roundMoney(totalPaintableArea),
  };
}

export function calculateBudgetLine(quantity: number, unitPrice: number) {
  return roundMoney(quantity * unitPrice);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
