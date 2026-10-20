import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <main className="min-h-screen px-4 py-8" aria-busy="true">
      <div className="mx-auto flex max-w-6xl items-center gap-3 text-lg font-bold text-moss" role="status">
        <LoaderCircle size={24} className="motion-safe:animate-spin" aria-hidden="true" />
        Abriendo pagina...
      </div>
    </main>
  );
}
