"use client";

import { FormEvent, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, ImagePlus, Upload } from "lucide-react";
import { uploadProjectFileAction } from "@/actions/fileActions";
import { formatDate } from "@/lib/calculations";
import type { ProjectFile } from "@/lib/types";

type FileUploaderProps = {
  projectId: string;
  files: ProjectFile[];
};

export function FileUploader({ projectId, files }: FileUploaderProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const images = files.filter((file) => file.file_type.startsWith("image/"));
  const documents = files.filter((file) => !file.file_type.startsWith("image/"));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await uploadProjectFileAction(formData);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <h2>Fotos y documentos</h2>
      </div>
      <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3 rounded-lg bg-paper p-3 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="project_id" value={projectId} />
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-white px-3 text-sm font-bold text-muted">
          <ImagePlus size={19} />
          <input className="w-full text-sm" name="files" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" multiple required />
        </label>
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60" disabled={isPending}>
          <Upload size={18} />
          {isPending ? "Subiendo..." : "Subir archivos"}
        </button>
      </form>
      <p className="mt-2 text-xs font-semibold text-muted">
        Puedes seleccionar varias fotos o documentos a la vez.
      </p>

      <div className="mt-5">
        <h3 className="text-sm font-black uppercase text-muted">Galeria</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.length === 0 ? (
            <p className="col-span-full rounded-lg bg-paper p-4 text-sm text-muted">No hay imagenes subidas todavia.</p>
          ) : (
            images.map((file) => (
              <a key={file.id} href={file.signed_url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-line bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.signed_url} alt={file.file_name} className="aspect-square w-full object-cover" />
                <span className="block truncate px-3 py-2 text-xs font-bold text-ink">{file.file_name}</span>
              </a>
            ))
          )}
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-black uppercase text-muted">Documentos</h3>
        <div className="mt-3 grid gap-2">
          {documents.length === 0 ? (
            <p className="rounded-lg bg-paper p-4 text-sm text-muted">No hay documentos subidos todavia.</p>
          ) : (
            documents.map((file) => (
              <a key={file.id} href={file.signed_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-line bg-white p-3">
                <FileText size={20} className="text-clay" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-ink">{file.file_name}</strong>
                  <small className="text-muted">{formatDate(file.created_at)}</small>
                </span>
                <Download size={18} className="text-moss" />
              </a>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
