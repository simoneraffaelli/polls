"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Availability, SeriesPoint } from "@/platform/presentation/models";
import { DataNotice } from "./data-notice";

export function TimeSeriesChart({
  title,
  unit,
  state,
}: {
  title: string;
  unit: string;
  state: Availability<readonly SeriesPoint[]>;
}) {
  if (state.status !== "ready") return <DataNotice state={state} />;
  if (state.value.length === 0)
    return (
      <DataNotice
        state={{
          status: "empty",
          message: "La serie temporale non è ancora disponibile.",
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
          <LineChart
            accessibilityLayer={false}
            data={[...state.value]}
            margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={38} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Leggi i valori del grafico</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {state.value.map((point) => (
              <tr key={`${point.date}:${point.label}`}>
                <th scope="row">
                  {point.date} · {point.label}
                </th>
                <td>{point.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
