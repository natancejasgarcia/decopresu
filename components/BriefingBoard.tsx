"use client";

import dynamic from "next/dynamic";
import type { BriefingProject, BriefingSnapshot } from "@/lib/briefing";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

const Canvas = dynamic(
  async () => {
    window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
    return import("./BriefingCanvas");
  },
  {
    ssr: false,
    loading: () => (
      <div className="briefing-loading" role="status">
        Abriendo pizarra...
      </div>
    ),
  },
);

export function BriefingBoard(props: {
  initial: BriefingSnapshot;
  projects: BriefingProject[];
  available: boolean;
  userId: string;
}) {
  return <Canvas {...props} />;
}
