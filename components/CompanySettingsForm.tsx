"use client";
import { useState } from "react";
import { useAsyncTask } from "@/lib/useAsyncTask";
import { Save } from "lucide-react";
import { saveCompanySettings } from "@/lib/companySettingsClient";
import type { CompanySettings } from "@/lib/sales";

export function CompanySettingsForm({
  initial,
  available,
  onSaved,
  fiscalOnly = false,
}: {
  initial: CompanySettings;
  available: boolean;
  onSaved?: (settings: CompanySettings) => void;
  fiscalOnly?: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useAsyncTask();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const fields: {
    key: Exclude<keyof CompanySettings, "id">;
    label: string;
    type?: string;
  }[] = [
    { key: "legal_name", label: "Nombre fiscal de la empresa" },
    { key: "tax_id", label: "NIF / CIF" },
    { key: "address", label: "Dirección fiscal" },
    { key: "email", label: "Correo electrónico", type: "email" },
    { key: "phone", label: "Teléfono", type: "tel" },
    { key: "iban", label: "Cuenta bancaria (IBAN)" },
    { key: "invoice_series", label: "Serie de facturas" },
    { key: "delivery_series", label: "Serie de albaranes" },
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage("");
        setRequiresLogin(false);
        startTransition(async () => {
          try {
            const result = await saveCompanySettings(settings);
            setError(!result.ok);
            setMessage(
              result.ok ? "Datos de empresa guardados." : result.error,
            );
            if (result.ok) {
              setSettings(result.settings);
              onSaved?.(result.settings);
            } else setRequiresLogin(Boolean(result.requiresLogin));
          } catch {
            setError(true);
            setMessage("No se pudo confirmar el guardado. Tus datos siguen en pantalla; vuelve a intentarlo.");
          }
        });
      }}
      className="grid gap-5"
    >
      {!available && (
        <p className="feedback-error">
          Los datos fiscales están pendientes de activar en la base de datos.
        </p>
      )}
      <fieldset
        disabled={pending || !available}
        className="grid min-w-0 gap-4 sm:grid-cols-2"
      >
        {fields
          .filter(
            (field) =>
              !fiscalOnly ||
              ["legal_name", "tax_id", "address"].includes(field.key),
          )
          .map((field) => (
            <label
              key={field.key}
              className={field.key === "address" ? "sm:col-span-2" : ""}
            >
              <span className="form-label">{field.label}</span>
              <input
                className="form-input"
                type={field.type ?? "text"}
                value={settings[field.key]}
                onChange={(e) =>
                  setSettings((v) => ({ ...v, [field.key]: e.target.value }))
                }
                required={
                  ["legal_name", "tax_id", "address"].includes(field.key) ||
                  field.key.endsWith("series")
                }
                pattern={
                  field.key.endsWith("series") ? "[A-Z0-9]{1,8}" : undefined
                }
                maxLength={field.key.endsWith("series") ? 8 : 400}
              />
            </label>
          ))}
      </fieldset>
      {message && (
        <p
          className={error ? "feedback-error" : "feedback-success"}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {requiresLogin ? <a className="action-secondary justify-self-start" href="/login" target="_blank" rel="noopener noreferrer">Iniciar sesion</a> : null}
      <button
        className="action-primary justify-self-start"
        type="submit"
        disabled={pending || !available}
      >
        <Save size={20} />
        {pending ? "Guardando…" : "Guardar datos de empresa"}
      </button>
    </form>
  );
}
