import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <Suspense fallback={<div className="text-sm font-bold text-muted">Cargando...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
