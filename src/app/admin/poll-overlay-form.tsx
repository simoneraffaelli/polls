"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type PollLink = {
  link_id: string;
  poll_id: string;
  edition_id: string;
  race_id: string | null;
  external_id: string;
  source_name: string;
  pollster: string;
  excluded: boolean | null;
  exclusion_reason: string | null;
  included: boolean | null;
  link_reason: string | null;
};

export function PollOverlayForm(props: {
  links: PollLink[];
  destinations: {
    sectionId: string;
    editionId: string;
    sectionName: string;
    editionName: string;
  }[];
  races: { id: string; editionId: string; name: string }[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(props.links[0]?.link_id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const link = props.links.find((item) => item.link_id === selectedId);
  const destination = props.destinations.find(
    (item) => item.editionId === link?.edition_id,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!link || !destination) return;
    const form = new FormData(
      event.currentTarget,
      (event.nativeEvent as SubmitEvent).submitter,
    );
    const action = String(form.get("action") ?? "");
    const reason = String(form.get("reason") ?? "").trim();
    const command =
      action === "exclude"
        ? {
            action: "poll.excluded",
            scope: {
              sectionId: destination.sectionId,
              editionId: destination.editionId,
            },
            pollId: link.poll_id,
            excluded: !link.excluded,
            reason,
          }
        : {
            action: "poll.reassociate",
            scope: {
              sectionId: destination.sectionId,
              editionId: destination.editionId,
            },
            pollId: link.poll_id,
            oldLinkId: link.link_id,
            raceId: String(form.get("raceId") ?? "") || null,
            reason,
          };
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      setMessage(
        response.ok
          ? "Decisione registrata. Lo storico originale resta disponibile."
          : "Decisione non registrata: verifica gara e motivo.",
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage("Servizio non disponibile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold">Decisioni sui sondaggi</h2>
      <p className="mt-2 text-sm">
        Le esclusioni riguardano i prossimi calcoli. Una correzione di gara
        aggiunge un’associazione e conserva quella precedente nello storico.
      </p>
      {props.links.length === 0 ? (
        <p className="mt-4">Nessun sondaggio acquisito.</p>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-4 rounded border p-4">
          <label className="grid gap-1 text-sm">
            Sondaggio
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="rounded border p-2 text-black"
            >
              {props.links.map((item) => (
                <option key={item.link_id} value={item.link_id}>
                  {item.pollster} · {item.external_id} · {item.edition_id}
                  {item.race_id ? " · gara" : " · nazionale"}
                </option>
              ))}
            </select>
          </label>
          {link && (
            <p className="text-sm">
              {link.source_name} ·{" "}
              {link.excluded
                ? "Escluso dai nuovi calcoli"
                : "Ammesso ai nuovi calcoli"}{" "}
              ·{" "}
              {link.included === false
                ? "Associazione superata"
                : "Associazione corrente"}
              {link.exclusion_reason && ` · Motivo: ${link.exclusion_reason}`}
              {link.link_reason && ` · Associazione: ${link.link_reason}`}
            </p>
          )}
          <label className="grid gap-1 text-sm">
            Nuova associazione
            <select
              key={link?.link_id}
              name="raceId"
              defaultValue={link?.race_id ?? ""}
              className="rounded border p-2 text-black"
            >
              <option value="">Scheda nazionale, nessuna gara</option>
              {props.races
                .filter((race) => race.editionId === link?.edition_id)
                .map((race) => (
                  <option key={race.id} value={race.id}>
                    {race.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Motivo della decisione
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              className="rounded border p-2 text-black"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="action"
              value="exclude"
              disabled={busy}
              className="rounded border px-3 py-2 text-sm"
            >
              {link?.excluded
                ? "Riammetti ai nuovi calcoli"
                : "Escludi dai nuovi calcoli"}
            </button>
            <button
              type="submit"
              name="action"
              value="reassociate"
              disabled={busy || link?.included === false}
              className="rounded border px-3 py-2 text-sm"
            >
              Correggi associazione
            </button>
          </div>
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
