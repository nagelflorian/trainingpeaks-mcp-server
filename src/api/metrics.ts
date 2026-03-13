import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "../api.js";
import { getAthleteId } from "../auth.js";

// ─── Metrics types (POST /metrics/v3/athletes/{id}/consolidatedtimedmetric) ──

export interface MetricEnumValue {
  value: number;
  label: string;
}

// Wire format for a single metric detail in the consolidated request
export interface MetricDetail {
  type: number; // metric type ID
  label: string;
  value: number;
  time: string; // ISO datetime (local, no timezone)
  temporaryId: number;
  units: string;
  formatedUnits: string; // sic — TP API uses this spelling
  min?: number;
  max?: number;
  enumeration?: MetricEnumValue[];
}

export interface MetricPayload {
  athleteId: number;
  timeStamp: string; // ISO datetime at midnight of the day
  id: null;
  details: MetricDetail[];
}

// ─── Metric type definitions (confirmed from network captures) ────────────────

interface NumericMetricDef {
  kind: "numeric";
  type: number;
  label: string;
  units: string;
  min: number;
  max: number;
}

interface EnumMetricDef {
  kind: "enum";
  type: number;
  label: string;
  enumeration: Array<{ value: number; label: string }>;
}

type MetricDef = NumericMetricDef | EnumMetricDef;

const METRIC_DEFS: Record<string, MetricDef> = {
  pulse: {
    kind: "numeric",
    type: 5,
    label: "Pulse",
    units: "bpm",
    min: 10,
    max: 200,
  },
  weight_kg: {
    kind: "numeric",
    type: 9,
    label: "Weight",
    units: "kg",
    min: 0,
    max: 1000,
  },
  rmr: {
    kind: "numeric",
    type: 15,
    label: "RMR",
    units: "kcal",
    min: 500,
    max: 5000,
  },
  injury: {
    kind: "enum",
    type: 23,
    label: "Injury",
    enumeration: [
      { value: 1, label: "Extremely Injured" },
      { value: 2, label: "Very Injured" },
      { value: 3, label: "Injured" },
      { value: 4, label: "Slightly Injured" },
      { value: 5, label: "Below Average" },
      { value: 6, label: "Above Average" },
      { value: 7, label: "Well" },
      { value: 8, label: "Healthy" },
      { value: 9, label: "Very Healthy" },
      { value: 10, label: "Extremely Healthy" },
    ],
  },
  sleep_hours: {
    kind: "numeric",
    type: 6,
    label: "Sleep",
    units: "hours",
    min: 0,
    max: 72,
  },
  hrv: {
    kind: "numeric",
    type: 60,
    label: "HRV",
    units: "",
    min: 0,
    max: 200,
  },
  spo2: {
    kind: "numeric",
    type: 53,
    label: "SPO2",
    units: "%",
    min: 0,
    max: 100,
  },
  steps: {
    kind: "numeric",
    type: 58,
    label: "Steps",
    units: "steps",
    min: 0,
    max: 1_000_000_000,
  },
};

// Label lookup for GET responses (type ID → human label)
const TYPE_LABELS: Record<number, string> = Object.fromEntries(
  Object.values(METRIC_DEFS).map((d) => [d.type, d.label])
);

// ─── Response types for GET ───────────────────────────────────────────────────

interface MetricDetailResponse {
  parentId: number;
  type: number;
  value: number;
  isPotentiallyNegative: boolean;
  uploadClient: string | null;
  label: string;
  time: string;
  modifiedTime: string | null;
}

interface MetricDayResponse {
  id: string;
  athleteId: number;
  timeStamp: string;
  details: MetricDetailResponse[];
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function logMetrics(date: string, details: MetricDetail[]): Promise<void> {
  const athleteId = await getAthleteId();
  const payload: MetricPayload = {
    athleteId,
    timeStamp: `${date}T00:00:00`,
    id: null,
    details,
  };
  await api<unknown>({
    method: "post",
    path: `/metrics/v3/athletes/${athleteId}/consolidatedtimedmetric`,
    data: payload,
  });
}

export async function getMetrics(startDate: string, endDate: string): Promise<MetricDayResponse[]> {
  const athleteId = await getAthleteId();
  return api<MetricDayResponse[]>({
    method: "get",
    path: `/metrics/v3/athletes/${athleteId}/consolidatedtimedmetrics/${startDate}/${endDate}`,
  });
}

export async function getNutrition(startDate: string, endDate: string): Promise<unknown[]> {
  const athleteId = await getAthleteId();
  return api<unknown[]>({
    method: "get",
    path: `/fitness/v1/athletes/${athleteId}/nutrition/${startDate}/${endDate}`,
  });
}

// ─── Builder ─────────────────────────────────────────────────────────────────

function buildDetail(key: string, value: number, date: string): MetricDetail {
  const def = METRIC_DEFS[key];
  if (!def) throw new Error(`Unknown metric: ${key}`);
  const time = `${date}T12:00:00`;
  if (def.kind === "numeric") {
    return {
      type: def.type,
      label: def.label,
      value,
      time,
      temporaryId: 0,
      units: def.units,
      formatedUnits: def.units,
      min: def.min,
      max: def.max,
    };
  } else {
    if (!def.enumeration.some((e) => e.value === value)) {
      throw new Error(
        `Invalid value ${value} for ${key}. Valid values: ${def.enumeration.map((e) => `${e.value}=${e.label}`).join(", ")}`
      );
    }
    return {
      type: def.type,
      label: def.label,
      value,
      time,
      temporaryId: 0,
      units: "",
      formatedUnits: "",
      enumeration: def.enumeration,
    };
  }
}

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerMetricTools(mcp: McpServer): void {
  mcp.registerTool(
    "get_nutrition",
    {
      description:
        "Retrieve nutrition logs for a date range (data synced from connected apps like MyFitnessPal)",
      inputSchema: {
        start_date: z.string().describe("Start date YYYY-MM-DD"),
        end_date: z.string().describe("End date YYYY-MM-DD"),
      },
    },
    async ({ start_date, end_date }) => {
      const entries = await getNutrition(start_date, end_date);
      if (entries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No nutrition data found between ${start_date} and ${end_date}.`,
            },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }] };
    }
  );

  mcp.registerTool(
    "get_metrics",
    {
      description:
        "Retrieve logged health and wellness metrics (weight, heart rate, SPO2, steps, etc.) for a date range",
      inputSchema: {
        start_date: z.string().describe("Start date YYYY-MM-DD"),
        end_date: z.string().describe("End date YYYY-MM-DD"),
      },
    },
    async ({ start_date, end_date }) => {
      const days = await getMetrics(start_date, end_date);
      const populated = days.filter((d) => d.details.length > 0);
      if (populated.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No metrics found between ${start_date} and ${end_date}.`,
            },
          ],
        };
      }
      const lines: string[] = [];
      for (const day of populated) {
        const date = day.timeStamp.slice(0, 10);
        lines.push(date);
        for (const d of day.details) {
          const label = TYPE_LABELS[d.type] ?? d.label;
          lines.push(`  ${label}: ${d.value}${d.uploadClient ? ` (${d.uploadClient})` : ""}`);
        }
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "log_metrics",
    {
      description:
        "Log daily health and wellness metrics. All metric fields are optional — only provided values are sent.",
      inputSchema: {
        date: z.string().describe("Date in YYYY-MM-DD format"),
        weight_kg: z.number().min(0).max(1000).optional().describe("Body weight in kilograms"),
        pulse: z.number().int().min(10).max(200).optional().describe("Resting heart rate in bpm"),
        hrv: z.number().min(0).max(200).optional().describe("Heart rate variability"),
        sleep_hours: z.number().min(0).max(72).optional().describe("Sleep duration in hours"),
        spo2: z.number().min(0).max(100).optional().describe("Blood oxygen saturation (%)"),
        steps: z.number().int().min(0).optional().describe("Daily step count"),
        rmr: z.number().min(500).max(5000).optional().describe("Resting metabolic rate (kcal/day)"),
        injury: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe(
            "Health/injury status: 1=Extremely Injured, 5=Below Average, 8=Healthy, 10=Extremely Healthy"
          ),
      },
    },
    async (params) => {
      const details: MetricDetail[] = [];
      if (params.weight_kg !== undefined)
        details.push(buildDetail("weight_kg", params.weight_kg, params.date));
      if (params.pulse !== undefined) details.push(buildDetail("pulse", params.pulse, params.date));
      if (params.hrv !== undefined) details.push(buildDetail("hrv", params.hrv, params.date));
      if (params.sleep_hours !== undefined)
        details.push(buildDetail("sleep_hours", params.sleep_hours, params.date));
      if (params.spo2 !== undefined) details.push(buildDetail("spo2", params.spo2, params.date));
      if (params.steps !== undefined) details.push(buildDetail("steps", params.steps, params.date));
      if (params.rmr !== undefined) details.push(buildDetail("rmr", params.rmr, params.date));
      if (params.injury !== undefined)
        details.push(buildDetail("injury", params.injury, params.date));

      if (details.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No metrics provided — nothing logged." }],
        };
      }

      await logMetrics(params.date, details);

      const lines = [`Metrics logged for ${params.date}:`];
      if (params.weight_kg !== undefined) lines.push(`  Weight: ${params.weight_kg} kg`);
      if (params.pulse !== undefined) lines.push(`  Pulse: ${params.pulse} bpm`);
      if (params.hrv !== undefined) lines.push(`  HRV: ${params.hrv}`);
      if (params.sleep_hours !== undefined) lines.push(`  Sleep: ${params.sleep_hours} hours`);
      if (params.spo2 !== undefined) lines.push(`  SPO2: ${params.spo2}%`);
      if (params.steps !== undefined) lines.push(`  Steps: ${params.steps}`);
      if (params.rmr !== undefined) lines.push(`  RMR: ${params.rmr} kcal`);
      if (params.injury !== undefined) {
        const def = METRIC_DEFS.injury as EnumMetricDef;
        const label =
          def.enumeration.find((e) => e.value === params.injury)?.label ?? params.injury;
        lines.push(`  Health/Injury: ${params.injury}/10 (${label})`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}
