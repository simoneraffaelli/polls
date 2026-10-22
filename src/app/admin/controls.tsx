"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

type Props =
  | { kind: "logout" }
  | {
      kind: "source";
      sourceId: string;
      enabled: boolean;
      excluded: boolean;
      canCollect: boolean;
    }
  | { kind: "binding"; sourceId: string; sectionId: string; enabled: boolean };

export function AdminControls(props: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (props.kind === "logout")
    return (
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        onClick={async () => {
          await authClient.signOut();
          router.push("/admin/login");
          router.refresh();
        }}
      >
        Esci
      </button>
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (props.kind === "logout") return;
    setBusy(true);
    setMessage("");
    const data = new FormData(
      event.currentTarget,
      (event.nativeEvent as SubmitEvent).submitter,
    );
    const reason = String(data.get("reason") ?? "");
    const action = String(data.get("action") ?? "");
    const command =
      props.kind === "source"
        ? action === "retry"
          ? { action: "source.retry", sourceId: props.sourceId, reason }
          : action === "toggle-enabled"
            ? {
                action: "source.enabled",
                sourceId: props.sourceId,
                enabled: !props.enabled,
                reason,
              }
            : {
                action: "source.excluded",
                sourceId: props.sourceId,
                excluded: !props.excluded,
                reason,
              }
        : {
            action: "binding.enabled",
            sourceId: props.sourceId,
            sectionId: props.sectionId,
            enabled: !props.enabled,
            reason,
          };
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) {
        setMessage("Operazione non riuscita.");
        return;
      }
      if (action === "retry") setMessage("Raccolta accodata.");
      router.refresh();
    } catch {
      setMessage("Operazione non disponibile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={submit}>
      <label className="grid gap-1 text-xs">
        Motivo
        <input
          name="reason"
          required
          minLength={3}
          maxLength={500}
          className="min-w-56 rounded border p-2 text-black"
        />
      </label>
      {props.kind === "source" ? (
        <>
          <button
            disabled={busy}
            type="submit"
            name="action"
            value="toggle-enabled"
            className="rounded border px-3 py-2 text-sm"
          >
            {props.enabled ? "Sospendi" : "Attiva"}
          </button>
          {props.canCollect && (
            <button
              disabled={busy || !props.enabled}
              type="submit"
              name="action"
              value="retry"
              className="rounded border px-3 py-2 text-sm"
            >
              Avvia raccolta
            </button>
          )}
          <button
            disabled={busy}
            type="submit"
            name="action"
            value="toggle-excluded"
            className="rounded border px-3 py-2 text-sm"
          >
            {props.excluded ? "Riammetti ai calcoli" : "Escludi dai calcoli"}
          </button>
        </>
      ) : (
        <button
          disabled={busy}
          type="submit"
          name="action"
          value="toggle-binding"
          className="rounded border px-3 py-2 text-sm"
        >
          {props.enabled ? "Sospendi associazione" : "Attiva associazione"}
        </button>
      )}
      {message && (
        <span role="alert" className="text-sm">
          {message}
        </span>
      )}
    </form>
  );
}
