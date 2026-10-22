"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Availability,
  DistributionItem,
} from "@/platform/presentation/models";
import { DataNotice } from "./data-notice";

export function DistributionChart({
  title,
  unit,
  state,
}: {
  title: string;
  unit: string;
  state: Availability<readonly DistributionItem[]>;
}) {
  if (state.status !== "ready") return <DataNotice state={state} />;
  if (state.value.length === 0)
    return (
      <DataNotice
        state={{
          status: "empty",
          message: "La distribuzione non è ancora disponibile.",
        }}
      />
    );
  return (
    <figure className="chart-panel">
      <figcaption>
        <strong>{title}</strong>
        <span>{unit}</span>
      </figcaption>
      <div className="chart-canvas" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            accessibilityLayer={false}
            data={[...state.value]}
            margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={38} />
            <Tooltip />
            <Bar
              dataKey="value"
              fill="var(--accent)"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Leggi i valori del grafico</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Esito</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {state.value.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.label}</th>
                <td>{item.valueText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
