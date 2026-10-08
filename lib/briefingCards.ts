import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { BriefingProject } from "./briefing";

const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export function wrapBriefingText(text: string, columns = 31) {
  return text
    .split("\n")
    .map((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const chunks = word.match(new RegExp(`.{1,${columns}}`, "g")) ?? [""];
        for (const chunk of chunks) {
          if (line && line.length + chunk.length + 1 > columns) {
            lines.push(line);
            line = "";
          }
          line = line ? `${line} ${chunk}` : chunk;
        }
      }
      lines.push(line);
      return lines.join("\n");
    })
    .join("\n");
}

export function createBriefingCard(
  x: number,
  y: number,
  text: string,
  project?: BriefingProject,
) {
  const group = crypto.randomUUID();
  const content = project
    ? `${wrapBriefingText(project.name)}\n\n${wrapBriefingText(project.client_name)}\n\n${money.format(project.total)} · sin IVA\n${project.status}`
    : wrapBriefingText(text);
  const height = Math.max(
    project ? 215 : 130,
    content.split("\n").length * 23 + 40,
  );
  const customData = project
    ? { kind: "budget", projectId: project.id }
    : { kind: "note" };
  const backgroundColor = !project
    ? "#fffbdb"
    : project.status === "Presupuestado"
      ? "#fff1f2"
      : ["Aprobado", "Cobrado"].includes(project.status)
        ? "#ecfdf5"
        : "#eff6ff";
  return convertToExcalidrawElements([
    {
      type: "rectangle",
      x,
      y,
      width: 330,
      height,
      roughness: 0,
      strokeWidth: 1,
      strokeColor: "#cbd5d1",
      backgroundColor,
      fillStyle: "solid",
      groupIds: [group],
      customData,
      roundness: null,
      link: project ? `/projects/${project.id}` : null,
    },
    {
      type: "text",
      x: x + 20,
      y: y + 20,
      text: content,
      fontSize: 18,
      fontFamily: 2,
      strokeColor: "#1f2a2b",
      groupIds: [group],
      customData,
    },
  ]);
}
