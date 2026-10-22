"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelResult } from "@/elections/model/contracts";
import type { PublicScenarioBasis } from "@/elections/model/public-scenario";
import { forecastOutcomeLabel } from "@/platform/presentation/forecast";

type Response = {
  requestId: number;
  runId: string;
  result?: ModelResult;
  error?: string;
};

export function ScenarioCalculator({ basis }: { basis: PublicScenarioBasis }) {
  const active = useRef<Worker | null>(null);
  const serial = useRef(0);
  const [swing, setSwing] = useState(0);
  const [status, setStatus] = useState<"idle" | "working" | "ready" | "error">(
    "idle",
  );
  const [result, setResult] = useState<ModelResult | null>(null);
  const [resultSwing, setResultSwing] = useState<number | null>(null);
  const [historical, setHistorical] = useState(basis.readState === "frozen");

  useEffect(() => () => active.current?.terminate(), []);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (
        basis.readState === "frozen" ||
        Date.now() >= Date.parse(basis.cutoffAt)
      )
        setHistorical(true);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [basis.readState, basis.cutoffAt]);

  function cancel() {
    active.current?.terminate();
    active.current = null;
    serial.current += 1;
    setResult(null);
    setResultSwing(null);
    setStatus("idle");
  }
  function reset() {
    cancel();
    setSwing(0);
  }

  function calculate() {
    if (Date.now() >= Date.parse(basis.cutoffAt)) setHistorical(true);
    active.current?.terminate();
    serial.current += 1;
    const requestId = serial.current;
    let worker: Worker;
    try {
      worker = new Worker(new URL("./scenario-worker.ts", import.meta.url));
    } catch {
      setStatus("error");
      return;
    }
    active.current = worker;
    setResult(null);
    setResultSwing(null);
    setStatus("working");
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (
        event.data.requestId !== serial.current ||
        event.data.runId !== basis.runId
      )
        return;
      active.current?.terminate();
      active.current = null;
      if (event.data.result) {
        setResult(event.data.result);
        setResultSwing(swing);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    };
    worker.onerror = () => {
      if (requestId !== serial.current) return;
      active.current?.terminate();
      active.current = null;
      setStatus("error");
    };
    try {
      worker.postMessage({
        requestId,
        basis,
        swingPoints: swing,
        iterations: 1000,
      });
    } catch {
      worker.terminate();
      active.current = null;
      setStatus("error");
    }
  }

  return (
    <section
      className="content-section"
      aria-labelledby="scenario-calculator-title"
    >
      <h3 id="scenario-calculator-title">Scenario personale</h3>
      <p>
        {historical ? "Scenario storico" : "Scenario su domanda aperta"}
        {" · Modello sperimentale · Run "}
        {basis.runId}
      </p>
      <label htmlFor="scenario-swing">
        Variazione uniforme a favore di{" "}
        {basis.control?.outcomeKind === "chamber_control"
          ? (basis.estimates[0]?.positive.caucusId ?? "esito positivo")
          : (basis.estimates[0]?.positive.partyId ?? "esito positivo")}
        {" rispetto a "}
        {basis.control?.outcomeKind === "chamber_control"
          ? (basis.estimates[0]?.negative.caucusId ?? "esito negativo")
          : (basis.estimates[0]?.negative.partyId ?? "esito negativo")}
        : {swing.toFixed(1)} punti percentuali
      </label>
      <input
        id="scenario-swing"
        type="range"
        min="-5"
        max="5"
        step="0.5"
        value={swing}
        onChange={(event) => {
          cancel();
          setSwing(Number(event.target.value));
        }}
      />
      <div className="hero-actions">
        <button
          type="button"
          onClick={calculate}
          disabled={status === "working"}
        >
          Calcola 1.000 simulazioni
        </button>
        <button type="button" onClick={reset}>
          Annulla e azzera
        </button>
      </div>
      <p role="status" aria-live="polite">
        {status === "working"
          ? "Calcolo in corso."
          : status === "error"
            ? "Calcolo non disponibile per questi parametri."
            : null}
      </p>
      {result ? (
        <div>
          <p>
            {historical ? "Scenario storico" : "Scenario"} dell’utente con
            variazione di {resultSwing?.toFixed(1)} punti percentuali, separato
            dalla previsione pubblicata.
          </p>
          {result.questionOutcomeProbabilities.length ? (
            <ul>
              {result.questionOutcomeProbabilities.map((outcome) => (
                <li key={outcome.outcomeId}>
                  {forecastOutcomeLabel(outcome.outcomeId)}: probabilità del
                  modello {(outcome.probability * 100).toFixed(1)}%
                </li>
              ))}
            </ul>
          ) : (
            <p>
              La copertura non consente di calcolare una probabilità di
              controllo.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
