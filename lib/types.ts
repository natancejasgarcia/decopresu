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

export type RoomPaintScope = "walls_and_ceiling" | "ceiling_only" | "manual_area";

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
  created_at: string;
};
