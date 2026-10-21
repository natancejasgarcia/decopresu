"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Download, FileCheck2, Save } from "lucide-react";
import { saveSalesCorrectionAction, issueSalesCorrectionAction } from "@/actions/salesCorrectionActions";
import { useAsyncTask } from "@/lib/useAsyncTask";
import { formatCurrency } from "@/lib/calculations";
import { todayMadrid, type CompanySettings, type SalesDocument } from "@/lib/sales";
import type { CorrectionInput, SalesCorrection } from "@/lib/salesCorrections";

export function SalesCorrectionForm({ original, company, corrections }: {
  original: SalesDocument; company: CompanySettings; corrections: SalesCorrection[];
}) {
  const draft = corrections.find(item => item.status === "draft");
  const [input, setInput] = useState<CorrectionInput>(() => ({
    client_name: draft?.client.client_name ?? original.client_name,
    client_tax_id: draft?.client.client_tax_id ?? original.client_tax_id,
    client_address: draft?.client.client_address ?? original.client_address,
    client_postal_code: draft?.client.client_postal_code ?? original.client_postal_code ?? "",
    client_city: draft?.client.client_city ?? original.client_city ?? "",
    client_province: draft?.client.client_province ?? original.client_province ?? "",
    client_email: draft?.client.client_email ?? original.client_email,
    correction_date: draft?.correction_date ?? todayMadrid(),
    reason: draft?.reason ?? "Rectificacion de datos fiscales del emisor y del destinatario. Sin modificacion de importes.",
  }));
  const [savedId, setSavedId] = useState(draft?.id);
  const [issuedNumber, setIssuedNumber] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [issueUncertain, setIssueUncertain] = useState(false);
  const [pending, run] = useAsyncTask();
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const downloadHref = (id: string) => `/sales/${original.id}/correction/${id}/pdf`;
  const fields = [
    ["client_name", "Nombre fiscal del cliente"], ["client_tax_id", "NIF / CIF"],
    ["client_address", "Calle y numero"], ["client_postal_code", "Codigo postal"],
    ["client_city", "Poblacion"], ["client_province", "Provincia"],
    ["client_email", "Correo electronico"], ["correction_date", "Fecha de rectificacion"],
  ] as const;
  return <div className="space-y-6">
    <Link href={`/sales/${original.id}`} className="action-secondary" prefetch={false}><ArrowLeft size={20} /> Volver a la factura</Link>
    <div><h1 className="text-2xl font-bold">Rectificar datos fiscales</h1>
      <p className="mt-2 text-muted">Factura original {original.number} · {formatCurrency(original.total)} · Sin cambio de importes</p>
    </div>
    <div className="border-y border-line py-4"><p className="font-bold">{company.legal_name}</p>
      <p className="mt-1 text-sm text-muted">{company.tax_id} · {company.address}</p>
      <Link href="/settings" className="mt-2 inline-block font-semibold text-moss underline" prefetch={false}>Datos de empresa</Link>
    </div>
    <form className="space-y-5" onSubmit={event => {
      event.preventDefault(); setMessage(undefined);
      run(async () => {
        try {
          const result = await saveSalesCorrectionAction(original.id, input);
          if (!result.ok) return setMessage({ error: true, text: result.error });
          setSavedId(result.id); setDirty(false); setMessage({ error: false, text: "Borrador de rectificativa guardado. Todavia no esta emitida." });
        } catch { setMessage({ error: true, text: "No se pudo confirmar el guardado. Tus datos siguen en pantalla." }); }
      });
    }}>
      <fieldset disabled={pending || !!issuedNumber || issueUncertain} className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label]) => <label key={key} className={key === "client_address" ? "sm:col-span-2" : ""}>
          <span className="form-label">{label}{key !== "client_email" ? " *" : ""}</span>
          <input className="form-input" value={input[key]} required={key !== "client_email"}
            type={key === "correction_date" ? "date" : key === "client_email" ? "email" : "text"}
            min={key === "correction_date" ? original.issue_date : undefined}
            inputMode={key === "client_postal_code" ? "numeric" : undefined}
            pattern={key === "client_postal_code" ? "[0-9]{5}" : undefined}
            onChange={event => { setInput(value => ({ ...value, [key]: event.target.value })); setDirty(true); setMessage(undefined); }} />
        </label>)}
        <label className="sm:col-span-2"><span className="form-label">Motivo de rectificacion *</span>
          <textarea className="form-input min-h-24" required maxLength={2000} value={input.reason}
            onChange={event => { setInput(value => ({ ...value, reason: event.target.value })); setDirty(true); setMessage(undefined); }} />
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        {!issuedNumber ? <button type="submit" className="action-primary" disabled={pending || issueUncertain}><Save size={20} />{pending ? "Guardando..." : "Guardar borrador"}</button> : null}
        {savedId ? <a className="action-secondary" href={downloadHref(savedId)}><Download size={20} />{issuedNumber ? "Descargar rectificativa" : "Ver PDF del borrador"}</a> : null}
        {savedId && !issuedNumber ? <button type="button" className="action-secondary" disabled={pending || dirty || issueUncertain} onClick={() => {
          if (!window.confirm(`Emitir la rectificativa de datos de ${original.number}, sin modificar importes ni cobros?`)) return;
          setMessage(undefined);
          run(async () => {
            try {
              const result = await issueSalesCorrectionAction(savedId);
              if (!result.ok) { if (result.uncertain) setIssueUncertain(true); return setMessage({ error: true, text: result.error }); }
              setIssuedNumber(result.number); setMessage({ error: false, text: `Rectificativa emitida: ${result.number}. La factura original y sus cobros se conservan.` });
            } catch { setIssueUncertain(true); setMessage({ error: true, text: "No se pudo confirmar la emision. Recarga para comprobar el historial antes de continuar." }); }
          });
        }}><FileCheck2 size={20} />Emitir rectificativa</button> : null}
      </div>
      {message ? <p role={message.error ? "alert" : "status"} className={message.error ? "feedback-error" : "feedback-success"}>{message.text}</p> : null}
      {!message && savedId && !dirty && !issuedNumber ? <p role="status" className="feedback-success">Borrador guardado. Rectificativa pendiente de emision.</p> : null}
      {issueUncertain ? <button type="button" className="action-secondary" onClick={() => window.location.reload()}>Comprobar historial</button> : null}
    </form>
    {corrections.some(item => item.status === "issued") ? <section className="border-t border-line pt-5"><h2 className="mb-3 text-lg font-bold">Rectificativas emitidas</h2>
      {corrections.filter(item => item.status === "issued").map(item => <a key={item.id} className="action-secondary mr-3 mb-3" href={downloadHref(item.id)}><Download size={18} />{item.number}</a>)}
    </section> : null}
  </div>;
}
