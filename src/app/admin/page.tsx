import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminAccessError, requireAdmin } from "@/infrastructure/auth/guard";
import { readAdminOverview } from "@/infrastructure/auth/admin-repository";
import { AdminControls } from "./controls";
import { AdminImportForm } from "./import-form";
import { isKnownCollectibleSource } from "@/composition/source-registry";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Pannello amministrativo",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin(
      new Request("https://polls.simone.ooo/admin", {
        headers: await headers(),
      }),
    );
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401)
      redirect("/admin/login");
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-semibold">
          Amministrazione non disponibile
        </h1>
        <p className="mt-4">
          Controlla la configurazione o i permessi dell’account.
        </p>
      </main>
    );
  }
  const overview = await readAdminOverview(admin.db);
  const manualSource = overview.sources.find(
    (source) => source.providerId === "provider:manual-import",
  );
  const manualBindings = overview.bindings.filter(
    (binding) => binding.sourceId === manualSource?.id && binding.enabled,
  );
  const importDestinations = overview.destinations.filter((destination) =>
    manualBindings.some(
      (binding) => binding.sectionId === destination.sectionId,
    ),
  );
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Amministrazione</h1>
          <p className="mt-2 text-sm">
            Fonti, associazioni e raccolte recenti.
          </p>
        </div>
        <AdminControls kind="logout" />
      </div>
      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Fonti</h2>
        <div className="mt-4 grid gap-4">
          {overview.sources.map((source) => (
            <article key={source.id} className="rounded border p-4">
              <h3 className="font-semibold">{source.name}</h3>
              <p className="mt-1 text-sm">
                {source.family} · {source.enabled ? "Attiva" : "Sospesa"} ·{" "}
                {source.excluded
                  ? "Esclusa dai nuovi calcoli"
                  : "Utilizzabile nei nuovi calcoli"}
              </p>
              <p className="mt-1 break-all text-xs">{source.id}</p>
              <AdminControls
                kind="source"
                sourceId={source.id}
                enabled={source.enabled}
                excluded={source.excluded}
                canCollect={isKnownCollectibleSource(
                  source.id,
                  source.providerId,
                )}
              />
            </article>
          ))}
          {overview.sources.length === 0 && <p>Nessuna fonte configurata.</p>}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Associazioni</h2>
        <ul className="mt-4 grid gap-3">
          {overview.bindings.map((binding) => (
            <li
              key={`${binding.sourceId}:${binding.sectionId}`}
              className="rounded border p-3"
            >
              <p className="text-sm">
                {binding.sectionName} · {binding.enabled ? "Attiva" : "Sospesa"}
              </p>
              <AdminControls
                kind="binding"
                sourceId={binding.sourceId}
                sectionId={binding.sectionId}
                enabled={binding.enabled}
              />
            </li>
          ))}
        </ul>
      </section>
      {manualSource && (
        <AdminImportForm
          sourceId={manualSource.id}
          ready={manualSource.enabled && importDestinations.length > 0}
          destinations={importDestinations}
          races={overview.raceChoices}
        />
      )}
      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Raccolte recenti</h2>
        <p className="mt-2 text-sm">
          Le raccolte manuali sono ammesse solo per le fonti registrate nel
          worker e associate a una sezione attiva.
        </p>
        <ul className="mt-4 grid gap-2">
          {overview.runs.map((run) => (
            <li key={run.id} className="rounded border p-3 text-sm">
              <span>
                {run.status} · {run.startedAt.toISOString()} ·{" "}
                {run.errorCode ?? "nessun errore"}
              </span>
              <span className="ml-2 break-all text-xs">{run.sourceId}</span>
            </li>
          ))}
          {overview.runs.length === 0 && <li>Nessuna raccolta eseguita.</li>}
        </ul>
      </section>
    </main>
  );
}
