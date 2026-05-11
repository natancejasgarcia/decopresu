import { createProjectAction } from "@/actions/projectActions";
import { PROJECT_STATUSES, PROJECT_TAGS, PROJECT_TYPES } from "@/lib/types";

export function ProjectForm() {
  return (
    <form action={createProjectAction} className="grid gap-4 rounded-lg border border-line bg-white p-4 shadow-soft">
      <div>
        <label className="form-label" htmlFor="name">Nombre del proyecto</label>
        <input className="form-input" id="name" name="name" required placeholder="Piso Gran Via" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="project_type">Tipo de obra</label>
          <select className="form-input" id="project_type" name="project_type" defaultValue="Pintura">
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="priority_tag">Etiqueta</label>
          <select className="form-input" id="priority_tag" name="priority_tag" defaultValue="Normal">
            {PROJECT_TAGS.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="client_name">Cliente</label>
          <input className="form-input" id="client_name" name="client_name" required placeholder="Nombre del cliente" />
        </div>
        <div>
          <label className="form-label" htmlFor="client_phone">Telefono</label>
          <input className="form-input" id="client_phone" name="client_phone" required inputMode="tel" placeholder="+34 600 000 000" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="client_email">Email opcional</label>
          <input className="form-input" id="client_email" name="client_email" type="email" placeholder="cliente@email.com" />
        </div>
        <div>
          <label className="form-label" htmlFor="status">Estado inicial</label>
          <select className="form-input" id="status" name="status" defaultValue="Pendiente">
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="form-label" htmlFor="address">Direccion</label>
        <input className="form-input" id="address" name="address" required placeholder="Calle, numero, poblacion" />
      </div>
      <div>
        <label className="form-label" htmlFor="next_step">Proximo paso</label>
        <input className="form-input" id="next_step" name="next_step" placeholder="Medir, enviar presupuesto, llamar cliente..." />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="form-label" htmlFor="visit_date">Visita</label>
          <input className="form-input" id="visit_date" name="visit_date" type="date" />
        </div>
        <div>
          <label className="form-label" htmlFor="start_date">Inicio</label>
          <input className="form-input" id="start_date" name="start_date" type="date" />
        </div>
        <div>
          <label className="form-label" htmlFor="end_date">Fin previsto</label>
          <input className="form-input" id="end_date" name="end_date" type="date" />
        </div>
      </div>
      <div>
        <label className="form-label" htmlFor="description">Descripcion del trabajo</label>
        <textarea className="form-input min-h-28" id="description" name="description" required minLength={3} placeholder="Pintura de paredes, techos, reparaciones..." />
      </div>
      <div>
        <label className="form-label" htmlFor="internal_notes">Notas internas</label>
        <textarea className="form-input min-h-24" id="internal_notes" name="internal_notes" placeholder="Acceso, horarios, detalles que no van al cliente..." />
      </div>
      <button className="h-12 rounded-lg bg-moss px-5 text-base font-black text-white">
        Crear proyecto
      </button>
    </form>
  );
}
