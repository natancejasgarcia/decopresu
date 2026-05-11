import { updateProjectAction } from "@/actions/projectActions";
import { PROJECT_STATUSES, PROJECT_TAGS, PROJECT_TYPES, type Project } from "@/lib/types";

type ProjectEditFormProps = {
  project: Project;
};

export function ProjectEditForm({ project }: ProjectEditFormProps) {
  return (
    <form action={updateProjectAction} className="grid gap-4 rounded-lg border border-line bg-white p-4">
      <input type="hidden" name="project_id" value={project.id} />
      <div>
        <label className="form-label" htmlFor="edit-name">Nombre del proyecto</label>
        <input className="form-input" id="edit-name" name="name" required defaultValue={project.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="edit-project-type">Tipo de obra</label>
          <select className="form-input" id="edit-project-type" name="project_type" defaultValue={project.project_type ?? "Pintura"}>
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="edit-priority-tag">Etiqueta</label>
          <select className="form-input" id="edit-priority-tag" name="priority_tag" defaultValue={project.priority_tag ?? "Normal"}>
            {PROJECT_TAGS.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="edit-client-name">Cliente</label>
          <input className="form-input" id="edit-client-name" name="client_name" required defaultValue={project.client_name} />
        </div>
        <div>
          <label className="form-label" htmlFor="edit-client-phone">Telefono</label>
          <input className="form-input" id="edit-client-phone" name="client_phone" required inputMode="tel" defaultValue={project.client_phone} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="edit-client-email">Email opcional</label>
          <input className="form-input" id="edit-client-email" name="client_email" type="email" defaultValue={project.client_email ?? ""} />
        </div>
        <div>
          <label className="form-label" htmlFor="edit-status">Estado</label>
          <select className="form-input" id="edit-status" name="status" defaultValue={project.status}>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="form-label" htmlFor="edit-address">Direccion</label>
        <input className="form-input" id="edit-address" name="address" required defaultValue={project.address} />
      </div>
      <div>
        <label className="form-label" htmlFor="edit-next-step">Proximo paso</label>
        <input className="form-input" id="edit-next-step" name="next_step" defaultValue={project.next_step ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="form-label" htmlFor="edit-visit-date">Visita</label>
          <input className="form-input" id="edit-visit-date" name="visit_date" type="date" defaultValue={project.visit_date ?? ""} />
        </div>
        <div>
          <label className="form-label" htmlFor="edit-start-date">Inicio</label>
          <input className="form-input" id="edit-start-date" name="start_date" type="date" defaultValue={project.start_date ?? ""} />
        </div>
        <div>
          <label className="form-label" htmlFor="edit-end-date">Fin previsto</label>
          <input className="form-input" id="edit-end-date" name="end_date" type="date" defaultValue={project.end_date ?? ""} />
        </div>
      </div>
      <div>
        <label className="form-label" htmlFor="edit-description">Descripcion del trabajo</label>
        <textarea className="form-input min-h-28" id="edit-description" name="description" required minLength={3} defaultValue={project.description} />
      </div>
      <div>
        <label className="form-label" htmlFor="edit-internal-notes">Notas internas</label>
        <textarea className="form-input min-h-24" id="edit-internal-notes" name="internal_notes" defaultValue={project.internal_notes ?? ""} />
      </div>
      <button className="h-12 rounded-lg bg-moss px-5 text-base font-black text-white">
        Guardar cambios
      </button>
    </form>
  );
}
