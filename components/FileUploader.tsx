"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, ImagePlus, Trash2, Upload } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const images = files.filter((file) => file.file_type.startsWith("image/"));
  const documents = files.filter((file) => !file.file_type.startsWith("image/"));

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const pastedFiles = getFilesFromClipboard(event);
      if (pastedFiles.length === 0) return;

      event.preventDefault();
      setUploadError(null);
      setSelectedFiles((currentFiles) => [...currentFiles, ...pastedFiles]);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFiles.length === 0) {
      setUploadError("Selecciona o pega al menos un archivo.");
      return;
    }

    const formData = new FormData();
    formData.set("project_id", projectId);
    selectedFiles.forEach((file) => formData.append("files", file));

    startTransition(async () => {
      try {
        setUploadError(null);
        await uploadProjectFileAction(formData);
        setSelectedFiles([]);
        formRef.current?.reset();
        router.refresh();
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "No se pudieron subir los archivos.");
      }
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.currentTarget.files ?? []);
    if (nextFiles.length === 0) return;

    setUploadError(null);
    setSelectedFiles((currentFiles) => [...currentFiles, ...nextFiles]);
    event.currentTarget.value = "";
  }

  function removeSelectedFile(indexToRemove: number) {
    setSelectedFiles((currentFiles) => currentFiles.filter((_file, index) => index !== indexToRemove));
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <h2>Fotos y documentos</h2>
      </div>
      <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3 rounded-lg bg-paper p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-white px-3 text-sm font-bold text-muted">
            <ImagePlus size={19} />
            <input
              ref={fileInputRef}
              className="w-full text-sm"
              name="files"
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              multiple
              onChange={handleFileChange}
            />
          </label>
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-black text-white disabled:opacity-60" disabled={isPending}>
            <Upload size={18} />
            {isPending ? "Subiendo..." : "Subir archivos"}
          </button>
        </div>
        <div
          className="rounded-lg border border-dashed border-line bg-white p-3 text-sm font-bold text-muted"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
        >
          Pulsa aqui y pega una captura con Ctrl+V, o selecciona archivos.
        </div>
        {selectedFiles.length > 0 ? (
          <div className="grid gap-2">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3 rounded-lg border border-line bg-white p-3">
                {file.type.startsWith("image/") ? <ImagePlus size={18} className="text-moss" /> : <FileText size={18} className="text-clay" />}
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-ink">{file.name}</strong>
                  <small className="text-muted">{formatFileSize(file.size)}</small>
                </span>
                <button
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line text-red-700"
                  onClick={() => removeSelectedFile(index)}
                  title="Quitar archivo"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {uploadError ? <p className="rounded-lg bg-red-50 p-3 text-sm font-black text-red-700">{uploadError}</p> : null}
      </form>
      <p className="mt-2 text-xs font-semibold text-muted">
        Archivos listos: {selectedFiles.length}. Puedes seleccionar varias fotos o documentos a la vez.
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

function getFilesFromClipboard(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items ?? []);
  return items
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map((file) => {
      if (file.name && file.name !== "image.png") return file;
      const extension = getExtensionFromType(file.type);
      return new File([file], `captura-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, {
        type: file.type || "image/png",
        lastModified: Date.now(),
      });
    });
}

function getExtensionFromType(fileType: string) {
  if (fileType === "image/jpeg") return "jpg";
  if (fileType === "image/webp") return "webp";
  if (fileType === "image/gif") return "gif";
  if (fileType === "application/pdf") return "pdf";
  return "png";
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
