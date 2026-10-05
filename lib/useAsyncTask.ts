"use client";
import { useRef, useState } from "react";

// React 18 transitions do not track asynchronous work after the first await.
export function useAsyncTask() {
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try {
      await task();
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return [pending, run] as const;
}
