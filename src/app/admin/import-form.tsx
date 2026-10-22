"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Destination = {
  sectionId: string;
  editionId: string;
  sectionName: string;
  editionName: string;
};
type Race = { id: string; editionId: string; name: string };
type Preview = {
  previewId: string | null;
  preview: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    errors: { row: number; code: string; path: string }[];
  };
};
type Payload = {
  sourceId: string;
  sectionId: string;
  editionId: string;
  raceId: string | null;
  format: "json" | "csv";
  content: string;
};

function ImportPreview({ preview }: { preview: Preview }) {
  return (
    <div className="mt-4 rounded border p-4 text-sm">
      <p>
        {preview.preview.totalRows} righe · {preview.preview.validRows} valide ·{" "}
        {preview.preview.invalidRows} da correggere
      </p>
      {preview.preview.errors.length > 0 && (
        <ul className="mt-2 list-inside list-disc">
          {preview.preview.errors.map((error, index) => (
            <li key={index}>
              Riga {error.row}: {error.code} {error.path}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportCommitForm({
  preview,
  busy,
  onSubmit,
}: {
  preview: Preview;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={onSubmit}>
      <label className="grid gap-1 text-sm">
        Motivo dell’import
        <input
          required
          minLength={3}
          maxLength={500}
          name="reason"
          className="min-w-64 rounded border p-2 text-black"
        />
      </label>
      <button
        disabled={busy}
        type="submit"
        className="rounded border px-3 py-2 text-sm"
      >
        Salva {preview.preview.validRows} rilevazioni
      </button>
    </form>
  );
}

export function AdminImportForm({
  sourceId,
  ready,
  destinations,
  races,
}: {
  sourceId: string;
  ready: boolean;
  destinations: Destination[];
  races: Race[];
}) {
  const router = useRouter();
  const [editionId, setEditionId] = useState(destinations[0]?.editionId ?? "");
  const [raceId, setRaceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const destination = destinations.find((item) => item.editionId === editionId);

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreview(null);
    setPayload(null);
    setMessage("");
    if (!destination || !file || file.size > 1_000_000) {
      setMessage("Seleziona un file entro 1 MB e una destinazione attiva.");
      return;
    }
    const format = file.name.toLowerCase().endsWith(".csv")
      ? "csv"
      : file.name.toLowerCase().endsWith(".json")
        ? "json"
        : null;
    if (!format) {
      setMessage("Sono ammessi file JSON o CSV.");
      return;
    }
    const nextPayload: Payload = {
      sourceId,
      sectionId: destination.sectionId,
      editionId: destination.editionId,
      raceId: raceId || null,
      format,
      content: await file.text(),
    };
    setBusy(true);
    try {
      const response = await fetch("/api/admin/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPayload),
      });
      if (!response.ok) {
        setMessage(
          "Anteprima non disponibile. Controlla fonte e associazione.",
        );
        return;
      }
      const result = (await response.json()) as Preview;
      setPreview(result);
      if (result.previewId) setPayload(nextPayload);
    } catch {
      setMessage("Anteprima non disponibile.");
    } finally {
      setBusy(false);
    }
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload || !preview?.previewId) return;
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    );
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          previewId: preview.previewId,
          reason,
        }),
      });
      if (!response.ok) {
        setMessage("Import non salvato. Rivedi l’anteprima e riprova.");
        return;
      }
      const result = (await response.json()) as { saved: number };
      setMessage(`${result.saved} rilevazioni salvate.`);
      setPayload(null);
      setPreview(null);
      router.refresh();
    } catch {
      setMessage("Import non disponibile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold">Import controllato</h2>
      <p className="mt-2 text-sm">
        Usa la fonte manuale per file JSON con osservazioni normalizzate o CSV
        con una colonna record_json. L’anteprima non salva rilevazioni.
      </p>
      {!ready && (
        <p className="mt-3 text-sm">
          Attiva la fonte manuale e la sua associazione prima dell’import.
        </p>
      )}
      <form className="mt-4 grid max-w-xl gap-3" onSubmit={inspect}>
        <label className="grid gap-1 text-sm">
          Edizione
          <select
            disabled={!ready}
            value={editionId}
            onChange={(event) => {
              setEditionId(event.target.value);
              setRaceId("");
              setPreview(null);
              setPayload(null);
            }}
            className="rounded border p-2 text-black"
          >
            {destinations.map((item) => (
              <option value={item.editionId} key={item.editionId}>
                {item.sectionName} · {item.editionName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Competizione
          <select
            disabled={!ready}
            value={raceId}
            onChange={(event) => {
              setRaceId(event.target.value);
              setPreview(null);
              setPayload(null);
            }}
            className="rounded border p-2 text-black"
          >
            <option value="">Rilevazione nazionale</option>
            {races
              .filter((race) => race.editionId === editionId)
              .map((race) => (
                <option value={race.id} key={race.id}>
                  {race.name}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          File
          <input
            required
            disabled={!ready}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setPayload(null);
            }}
          />
        </label>
        <button
          disabled={!ready || busy}
          type="submit"
          className="w-fit rounded border px-3 py-2 text-sm"
        >
          Mostra anteprima
        </button>
      </form>
      {preview && <ImportPreview preview={preview} />}
      {payload && preview?.previewId && (
        <ImportCommitForm preview={preview} busy={busy} onSubmit={commit} />
      )}
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
