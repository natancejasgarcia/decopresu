export type ProjectStatus =
  | "Pendiente"
  | "Presupuestado"
  | "Aprobado"
  | "En ejecución"
  | "Terminado"
  | "Cobrado";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "Pendiente",
  "Presupuestado",
  "Aprobado",
  "En ejecución",
  "Terminado",
  "Cobrado",
];

export type ProjectType = "Pintura" | "Laca";

export const PROJECT_TYPES: ProjectType[] = ["Pintura", "Laca"];

export type RoomPaintScope = "walls_and_ceiling" | "ceiling_only" | "walls_only" | "manual_area";

export type RoomModuleType = "ceiling_only" | "walls_only" | "manual_area" | "free";

export type Profile = {
  id: string;
  user_id: string;
  name: string;
  role: "admin" | "member";
  created_at: string;
};

export type Project = {
  id: string;
  name: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  address: string;
  description: string;
  status: ProjectStatus;
  project_type: ProjectType;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
};

export type Message = {
  id: string;
  project_id: string;
  user_id: string;
  text: string;
  created_at: string;
  user_name?: string;
};

export type ProjectRead = {
  id: string;
  project_id: string;
  user_id: string;
  last_read_at: string;
  created_at: string;
  updated_at: string;
};

export type DailyNote = {
  id: string;
  text: string;
  note_date: string;
  project_id: string | null;
  created_by: string;
  is_done: boolean;
  created_at: string;
  updated_at: string;
  author_name?: string;
  project_name?: string;
  project_client_name?: string;
  files?: DailyNoteFile[];
};

export type DailyNoteFile = {
  id: string;
  note_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_url: string;
  file_type: string;
  created_at: string;
  signed_url?: string;
};

export type BudgetValidation = {
  id: string;
  project_id: string | null;
  name: string;
  file_name: string;
  file_url: string;
  file_type: string;
  validation_notes: string | null;
  is_validated: boolean;
  created_by: string;
  validated_by: string | null;
  created_at: string;
  validated_at: string | null;
  signed_url?: string;
  created_by_name?: string;
  validated_by_name?: string;
  project_name?: string;
  project_client_name?: string;
};

export type ProjectFile = {
  id: string;
  project_id: string;
  uploaded_by: string;
  file_name: string;
  file_url: string;
  file_type: string;
  created_at: string;
  signed_url?: string;
};

export type Room = {
  id: string;
  project_id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  ceiling_area: number;
  wall_area: number;
  openings_area: number;
  manual_area: number;
  total_paintable_area: number;
  paint_scope: RoomPaintScope;
  unit_price: number;
  notes: string | null;
  created_at: string;
  modules?: RoomModule[];
};

export type RoomModule = {
  id: string;
  project_id: string;
  room_id: string;
  module_type: RoomModuleType;
  concept: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type BudgetItem = {
  id: string;
  project_id: string;
  concept: string;
  notes: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  sort_order: number;
  created_at: string;
};

export type ExpenseCategory =
  | "Materiales"
  | "Mano de obra"
  | "Gasolina"
  | "Herramientas"
  | "Subcontrata"
  | "Otros";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Materiales",
  "Mano de obra",
  "Gasolina",
  "Herramientas",
  "Subcontrata",
  "Otros",
];

export type PaymentMethod = "Transferencia" | "Efectivo" | "Bizum" | "Tarjeta" | "Otro";

export const PAYMENT_METHODS: PaymentMethod[] = ["Transferencia", "Efectivo", "Bizum", "Tarjeta", "Otro"];

export type FixedCostFrequency = "Mensual" | "Trimestral" | "Anual";

export const FIXED_COST_FREQUENCIES: FixedCostFrequency[] = ["Mensual", "Trimestral", "Anual"];

export type ProjectExpense = {
  id: string;
  project_id: string | null;
  category: ExpenseCategory;
  supplier: string | null;
  concept: string;
  amount: number;
  expense_date: string;
  is_paid: boolean;
  notes: string | null;
  receipt_file_name: string | null;
  receipt_file_url: string | null;
  receipt_file_type: string | null;
  receipt_signed_url?: string;
  created_by: string;
  created_at: string;
};

export type ProjectPayment = {
  id: string;
  project_id: string | null;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  notes: string | null;
  receipt_file_name: string | null;
  receipt_file_url: string | null;
  receipt_file_type: string | null;
  receipt_signed_url?: string;
  created_by: string;
  created_at: string;
};

export type FixedCost = {
  id: string;
  name: string;
  amount: number;
  frequency: FixedCostFrequency;
  next_payment_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type SentEmailStatus = "sent" | "failed";

export type SentEmail = {
  id: string;
  project_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: SentEmailStatus;
  error_message: string | null;
  sent_by: string;
  created_at: string;
};
