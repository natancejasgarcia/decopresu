"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CloudOff,
  Download,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  LayoutGrid,
  Loader2,
  Maximize,
  Plus,
  Save,
  StickyNote,
  X,
} from "lucide-react";
import {
  Excalidraw,
  MainMenu,
  CaptureUpdateAction,
  reconcileElements,
  restoreElements,
  newElementWith,
  convertToExcalidrawElements,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
  AppState,
  BinaryFileData,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  readBriefingAction,
  saveBriefingAction,
} from "@/actions/briefingActions";
import { briefingFingerprint, briefingSceneSchema } from "@/lib/briefing";
import type {
  BriefingSnapshot,
  BriefingScene,
  BriefingProject,
} from "@/lib/briefing";
import { createBriefingCard } from "@/lib/briefingCards";
import "@excalidraw/excalidraw/index.css";

type Props = {
  initial: BriefingSnapshot;
  projects: BriefingProject[];
  available: boolean;
  userId: string;
};
type Status = "saved" | "dirty" | "saving" | "error";

export default function BriefingCanvas({
  initial,
  projects,
  available,
  userId,
}: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<Status>("saved");
  const [error, setError] = useState("");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [modal, setModal] = useState<"budget" | "note" | null>(null);
  const [projectId, setProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const current = useRef(initial.scene);
  const version = useRef(initial.version);
  const saved = useRef(briefingFingerprint(initial.scene));
  const changed = useRef(saved.current);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const alive = useRef(true);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const draftKey = `decoralia-briefing:${userId}`;

  const retainDraft = useCallback(
    (scene: BriefingScene) => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(scene));
      } catch {
        /* Export remains available if browser storage is full. */
      }
    },
    [draftKey],
  );

  const mergeRemote = useCallback(
    (snapshot: BriefingSnapshot) => {
      if (!api) return;
      const wasClean = changed.current === saved.current;
      const local = api.getSceneElementsIncludingDeleted();
      const remote = restoreElements(
        snapshot.scene.elements as unknown as ExcalidrawElement[],
        null,
      );
      const merged = reconcileElements(
        restoreElements(local, null),
        remote as unknown as Parameters<typeof reconcileElements>[1],
        api.getAppState(),
      );
      version.current = snapshot.version;
      saved.current = briefingFingerprint(snapshot.scene);
      api.addFiles(Object.values(snapshot.scene.files) as BinaryFileData[]);
      api.updateScene({
        elements: merged,
        appState: wasClean ? snapshot.scene.appState : undefined,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [api],
  );

  saveRef.current = async () => {
    if (busy.current || changed.current === saved.current || !alive.current)
      return;
    retainDraft(current.current);
    if (!available) {
      setStatus("error");
      setError("Pizarra pendiente de activar. Puedes descargar una copia.");
      return;
    }
    busy.current = true;
    setStatus("saving");
    const submitted = structuredClone(current.current);
    const fingerprint = changed.current;
    let retry = false;
    try {
      const result = await saveBriefingAction(version.current, submitted);
      if (!alive.current) return;
      if ("error" in result) {
        setError(result.error ?? "No se pudo guardar.");
        setStatus("error");
        return;
      }
      if (result.ok) {
        version.current = result.board.version;
        saved.current = fingerprint;
        setError("");
        setStatus(changed.current === fingerprint ? "saved" : "dirty");
        if (changed.current === fingerprint) {
          try {
            localStorage.removeItem(draftKey);
          } catch {
            /* A committed scene does not depend on browser storage. */
          }
        }
        retry = changed.current !== fingerprint;
      } else {
        mergeRemote(result.board);
        retry = true;
      }
    } catch {
      if (alive.current) {
        setStatus("error");
        setError(
          "Sin conexion. No cierres la pizarra: reintenta o descarga una copia.",
        );
      }
    } finally {
      busy.current = false;
      if (retry && alive.current)
        timer.current = setTimeout(() => void saveRef.current(), 700);
    }
  };

  const onChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      // Viewport, selection and cursors belong to each user, not the shared scene.
      const fileIds = new Set<string | null>(
        elements
          .filter((e) => e.type === "image")
          .map((e) => (e.type === "image" ? e.fileId : null)),
      );
      const scene: BriefingScene = {
        elements: elements as unknown as BriefingScene["elements"],
        appState: { viewBackgroundColor: appState.viewBackgroundColor },
        files: Object.fromEntries(
          Object.entries(files).filter(([id]) => fileIds.has(id)),
        ) as BriefingScene["files"],
      };
      current.current = scene;
      const fingerprint = briefingFingerprint(scene);
      const previous = changed.current;
      changed.current = fingerprint;
      const selected = elements.find(
        (e) =>
          !e.isDeleted &&
          appState.selectedElementIds[e.id] &&
          e.customData?.kind === "budget",
      );
      setSelectedProject(
        typeof selected?.customData?.projectId === "string"
          ? selected.customData.projectId
          : null,
      );
      if (fingerprint === saved.current) {
        if (!busy.current) setStatus("saved");
        return;
      }
      if (fingerprint === previous) return;
      setStatus("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveRef.current(), 1200);
    },
    [],
  );

  useEffect(() => {
    alive.current = true;
    const beforeLeave = (event: BeforeUnloadEvent) => {
      if (changed.current !== saved.current) {
        retainDraft(current.current);
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const whenOnline = () => void saveRef.current();
    window.addEventListener("beforeunload", beforeLeave);
    window.addEventListener("online", whenOnline);
    return () => {
      if (changed.current !== saved.current) retainDraft(current.current);
      alive.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("beforeunload", beforeLeave);
      window.removeEventListener("online", whenOnline);
    };
  }, [retainDraft]);

  useEffect(() => {
    if (!api) return;
    try {
      const draft = localStorage.getItem(draftKey);
      const parsed = draft && briefingSceneSchema.safeParse(JSON.parse(draft));
      if (parsed && parsed.success) {
        const elements = reconcileElements(
          restoreElements(api.getSceneElementsIncludingDeleted(), null),
          restoreElements(
            parsed.data.elements as unknown as ExcalidrawElement[],
            null,
          ) as unknown as Parameters<typeof reconcileElements>[1],
          api.getAppState(),
        );
        api.addFiles(Object.values(parsed.data.files) as BinaryFileData[]);
        api.updateScene({
          elements,
          appState: parsed.data.appState,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    } catch {
      /* Invalid drafts never replace the shared scene. */
    }
  }, [api, draftKey]);

  useEffect(() => {
    if (!api || !available) return;
    let cancelled = false;
    let reading = false;
    const sync = async () => {
      if (cancelled || reading || busy.current || document.hidden) return;
      reading = true;
      try {
        const result = await readBriefingAction(version.current);
        if (
          !cancelled &&
          !busy.current &&
          "board" in result &&
          result.board &&
          result.board.version > version.current
        )
          mergeRemote(result.board);
      } catch {
        /* Saving shows connection errors; polling is retried next interval. */
      } finally {
        reading = false;
      }
    };
    const interval = setInterval(() => void sync(), 12000);
    window.addEventListener("focus", sync);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", sync);
    };
  }, [api, available, mergeRemote]);

  useEffect(() => {
    if (modal && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current.querySelector<HTMLElement>("input, textarea")?.focus();
    }
    if (!modal) dialog.current?.close();
  }, [modal]);

  function center() {
    const state = api!.getAppState();
    return {
      x: -state.scrollX + state.width / state.zoom.value / 2 - 165,
      y: -state.scrollY + state.height / state.zoom.value / 2 - 100,
    };
  }
  function freePosition(width: number, height: number) {
    const point = center();
    const occupied = api!
      .getSceneElements()
      .filter((e) => e.type === "rectangle" || e.type === "image");
    for (let i = 0; i < 200; i++) {
      const x = point.x + (i % 3) * (width + 36);
      const y = point.y + Math.floor(i / 3) * (height + 36);
      if (
        !occupied.some(
          (e) =>
            x < e.x + e.width + 16 &&
            x + width + 16 > e.x &&
            y < e.y + e.height + 16 &&
            y + height + 16 > e.y,
        )
      )
        return { x, y };
    }
    const bottom = Math.max(...occupied.map((e) => e.y + e.height), point.y);
    return { x: point.x, y: bottom + 36 };
  }
  function addCard() {
    if (!api) return;
    const project =
      modal === "budget" ? projects.find((p) => p.id === projectId) : undefined;
    if ((modal === "budget" && !project) || (modal === "note" && !note.trim()))
      return;
    const point = center();
    const card = createBriefingCard(point.x, point.y, note.trim(), project);
    const bounds = card[0];
    const { x, y } = freePosition(bounds.width, bounds.height);
    const elements = card.map((e) =>
      newElementWith(e, { x: e.x + x - point.x, y: e.y + y - point.y }),
    );
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
      appState: {
        selectedElementIds: Object.fromEntries(
          elements.map((e) => [e.id, true]),
        ),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.setActiveTool({ type: "selection" });
    api.scrollToContent(elements, { animate: true });
    setModal(null);
    setNote("");
    setProjectId("");
    setSearch("");
  }
  function arrangeCards() {
    if (!api) return;
    const groups = new Map<
      string,
      { x: number; y: number; width: number; height: number }
    >();
    for (const e of api.getSceneElements())
      if (
        e.type === "rectangle" &&
        ["budget", "note"].includes(String(e.customData?.kind)) &&
        e.groupIds[0]
      )
        groups.set(e.groupIds[0], e);
    if (!groups.size) return;
    const maxHeight = Math.max(
      ...Array.from(groups.values()).map((e) => e.height),
    );
    const start = center();
    const positions = new Map(
      Array.from(groups).map(([group, bounds], i) => [
        group,
        {
          dx: start.x + (i % 3) * 370 - bounds.x,
          dy: start.y + Math.floor(i / 3) * (maxHeight + 40) - bounds.y,
        },
      ]),
    );
    api.updateScene({
      elements: api.getSceneElementsIncludingDeleted().map((e) => {
        const delta = positions.get(e.groupIds[0]);
        return delta && !e.isDeleted
          ? newElementWith(e, { x: e.x + delta.dx, y: e.y + delta.dy })
          : e;
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent(undefined, { fitToContent: true, animate: true });
  }
  function download() {
    if (!api) return;
    const blob = new Blob(
      [
        serializeAsJSON(
          api.getSceneElementsIncludingDeleted(),
          api.getAppState(),
          api.getFiles(),
          "local",
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "decoralia-pizarra.excalidraw";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function addImages(files: File[]) {
    if (!api || imageBusy) return;
    setImageBusy(true);
    try {
      for (const file of files.slice(0, 10)) {
        const image = await compressImage(file);
        const id = crypto.randomUUID() as BinaryFileData["id"];
        const data: BinaryFileData = {
          id,
          created: Date.now(),
          mimeType: "image/jpeg",
          dataURL: image.dataURL as BinaryFileData["dataURL"],
        };
        api.addFiles([data]);
        const width = Math.min(500, image.width);
        const height = (width * image.height) / image.width;
        const point = freePosition(width, height);
        const element = convertToExcalidrawElements([
          {
            type: "image",
            fileId: id,
            x: point.x,
            y: point.y,
            width,
            height,
            status: "saved",
          },
        ]);
        api.updateScene({
          elements: [...api.getSceneElementsIncludingDeleted(), ...element],
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        api.scrollToContent(element, { animate: true });
      }
      api.setActiveTool({ type: "selection" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la foto.");
    } finally {
      setImageBusy(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  return (
    <section className="briefing-workspace" aria-label="Pizarra compartida">
      {!available && (
        <div className="briefing-warning">
          Falta activar el guardado compartido en Supabase. Las notas antiguas
          siguen en Apuntes por dia. Puedes probar la pizarra y descargar una
          copia.
        </div>
      )}
      <div className="briefing-toolbar">
        <button
          className="briefing-primary"
          onClick={() => setModal("budget")}
          disabled={!api}
        >
          <FilePlus2 size={19} /> <span>Presupuesto</span>
        </button>
        <button onClick={() => setModal("note")} disabled={!api}>
          <StickyNote size={19} />
          <span>Apunte</span>
        </button>
        <button
          aria-label="Añadir fotos"
          title="Añadir fotos"
          onClick={() => imageInput.current?.click()}
          disabled={!api || imageBusy}
        >
          {imageBusy ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <ImagePlus size={20} />
          )}
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => void addImages(Array.from(e.target.files ?? []))}
        />
        <button
          title="Ordenar tarjetas"
          aria-label="Ordenar tarjetas"
          onClick={arrangeCards}
          disabled={!api}
        >
          <LayoutGrid size={20} />
        </button>
        <button
          title="Ver toda la pizarra"
          aria-label="Ver toda la pizarra"
          onClick={() =>
            api?.scrollToContent(undefined, {
              fitToContent: true,
              animate: true,
            })
          }
          disabled={!api}
        >
          <Maximize size={20} />
        </button>
        <button
          title="Descargar copia de la pizarra"
          aria-label="Descargar copia de la pizarra"
          onClick={download}
          disabled={!api}
        >
          <Download size={20} />
        </button>
        <button
          className={`briefing-save briefing-${status}`}
          onClick={() => void saveRef.current()}
          disabled={!api || status === "saving"}
          aria-label="Guardar pizarra"
          title={
            available
              ? "Guardar pizarra"
              : "Guardado compartido pendiente de activar"
          }
        >
          {status === "saving" ? (
            <Loader2 size={18} className="animate-spin" />
          ) : status === "error" || !available ? (
            <CloudOff size={18} />
          ) : status === "saved" ? (
            <Check size={18} />
          ) : (
            <Save size={18} />
          )}
          <span>
            {!available
              ? "Sin activar"
              : status === "saving"
                ? "Guardando"
                : status === "saved"
                  ? "Guardado"
                  : status === "error"
                    ? "Reintentar"
                    : "Guardar"}
          </span>
        </button>
      </div>
      {error && (
        <div className="briefing-error" role="alert">
          {error}
          <button
            title="Cerrar aviso"
            aria-label="Cerrar aviso"
            onClick={() => setError("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {selectedProject && (
        <div className="briefing-context">
          <Link href={`/projects/${selectedProject}`}>
            <FolderOpen size={17} /> Abrir obra
          </Link>
          <a
            href={`/projects/${selectedProject}/budget/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={17} /> Ver presupuesto PDF
          </a>
        </div>
      )}
      <div className="briefing-canvas">
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={{
            elements: initial.scene.elements as unknown as ExcalidrawElement[],
            appState: {
              ...initial.scene.appState,
              currentItemFontFamily: 2,
              currentItemRoughness: 0,
            },
            files: initial.scene.files as BinaryFiles,
            scrollToContent: true,
          }}
          langCode="es-ES"
          onChange={onChange}
          validateEmbeddable={false}
          onPaste={async (_data, event) => {
            const photos = Array.from(event?.clipboardData?.files ?? []).filter(
              (f) => f.type.startsWith("image/"),
            );
            if (!photos.length) return true;
            await addImages(photos);
            return false;
          }}
          onLinkOpen={(element, event) => {
            event.preventDefault();
            if (
              element.link &&
              /^\/projects\/[0-9a-f-]{36}$/.test(element.link)
            )
              window.location.assign(element.link);
          }}
          UIOptions={{
            tools: { image: false },
            canvasActions: {
              toggleTheme: false,
              loadScene: false,
              saveToActiveFile: false,
              clearCanvas: false,
            },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.Item icon={<Download size={16} />} onSelect={download}>
              Descargar pizarra
            </MainMenu.Item>
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        </Excalidraw>
      </div>
      <dialog
        ref={dialog}
        className="briefing-dialog"
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addCard();
          }}
        >
          <div className="briefing-dialog-heading">
            <h2>
              {modal === "budget" ? "Añadir presupuesto" : "Añadir apunte"}
            </h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
          </div>
          {modal === "budget" ? (
            <>
              <label className="form-label" htmlFor="briefing-search">
                Buscar obra
              </label>
              <input
                id="briefing-search"
                className="form-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre o cliente"
                autoFocus
              />
              <label className="form-label mt-4" htmlFor="briefing-project">
                Presupuesto
              </label>
              <select
                id="briefing-project"
                className="form-input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              >
                <option value="">Seleccionar obra</option>
                {projects
                  .filter((p) =>
                    `${p.name} ${p.client_name}`
                      .toLocaleLowerCase("es")
                      .includes(search.toLocaleLowerCase("es")),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.client_name}
                    </option>
                  ))}
              </select>
            </>
          ) : (
            <>
              <label className="form-label" htmlFor="briefing-note">
                Apunte
              </label>
              <textarea
                id="briefing-note"
                className="form-input"
                rows={5}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                autoFocus
              />
            </>
          )}
          <button className="action-primary mt-5 w-full" type="submit">
            <Plus size={19} /> Añadir a la pizarra
          </button>
        </form>
      </dialog>
    </section>
  );
}

async function compressImage(file: File) {
  if (
    !/^image\/(png|jpeg|webp|gif)$/.test(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw new Error("Elige una foto JPG, PNG o WebP de menos de 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      dataURL: canvas.toDataURL("image/jpeg", 0.78),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}
