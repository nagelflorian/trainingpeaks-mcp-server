import { randomUUID } from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { strengthApi } from "../api.js";
import { getAthleteId } from "../auth.js";

// ─── Structured Strength Workout types (api.peakswaresb.com) ─────────────────

export interface StrengthParameterUnit {
  title: string;
  abbreviation: string;
  unit: string;
}

export interface StrengthParameter {
  parameter: string; // e.g. "Reps", "RepsPerSide", "WeightPerSideKg"
  title: string;
  unit: StrengthParameterUnit;
  category: string;
  id: string;
}

export interface StrengthExercise {
  id: string; // library exercise ID (numeric string, e.g. "5178")
  ownerId?: number;
  title: string;
  videoUrl?: string | null;
  instructions?: string | null;
  parameters: StrengthParameter[];
  canEdit?: boolean;
}

export interface StrengthParameterValue {
  id: string; // UUID
  parameter: string;
  inputFormat: "Integer" | "Decimal";
  prescribedValue: string | null;
  executedValue: string | null;
}

export interface StrengthSet {
  id: string; // UUID
  isComplete: boolean;
  setOrigin: "Prescribed" | "Executed";
  parameterValues: StrengthParameterValue[];
}

export interface StrengthPrescription {
  id: string; // UUID
  exercise: StrengthExercise | null;
  parameters: StrengthParameter[]; // prescription-level params (have UUID ids, not library ids)
  sets: StrengthSet[];
  coachNotes: string | null;
  compliancePercent: number;
  setSummaryTemplate: string | null;
}

export interface StrengthBlock {
  id: string; // UUID
  blockType: "WarmUp" | "SingleExercise" | "Superset" | "Circuit" | "CoolDown";
  title: string | null;
  coachNotes: string | null;
  isComplete: boolean;
  compliancePercent: number;
  parameters: unknown[];
  prescriptions: StrengthPrescription[];
}

export interface StrengthWorkoutSnapshot {
  totalBlocks: number;
  completedBlocks: number;
  totalSets: number;
  completedSets: number;
  totalPrescriptions: number;
  completedPrescriptions: number;
}

export interface StrengthWorkout {
  id: string; // UUID before save; numeric string after save
  workoutType: "StructuredStrength";
  lastUpdatedAt: string | null;
  compliancePercent: number;
  rpe: number | null;
  feel: number | null;
  blocks: StrengthBlock[];
  snapshot: StrengthWorkoutSnapshot;
  prescribedDate: string; // YYYY-MM-DD
  prescribedStartTime: string | null;
  startDateTime: string | null;
  completedDateTime: string | null;
  calendarId: number;
  title: string;
  instructions: string | null;
  prescribedDurationInSeconds: number | null;
  orderOnDay: number | null;
  executedDurationInSeconds: number | null;
  isLocked: boolean;
  isHidden: boolean;
  workoutSubTypeId: number | null;
}

export interface StrengthWorkoutSummarySequenceItem {
  sequenceOrder: string;
  title: string;
  compliancePercent: number;
}

export interface StrengthWorkoutSummary {
  id: string;
  workoutType: "StructuredStrength";
  title: string;
  prescribedDate: string;
  calendarId: number;
  totalBlocks: number;
  completedBlocks: number;
  totalPrescriptions: number;
  completedPrescriptions: number;
  totalSets: number;
  completedSets: number;
  compliancePercent: number;
  rpe: number | null;
  feel: number | null;
  sequenceSummary: StrengthWorkoutSummarySequenceItem[];
  lastUpdatedAt: string | null;
  isLocked: boolean;
  isHidden: boolean;
  prescribedDurationInSeconds: number | null;
  executedDurationInSeconds: number | null;
}

// Input spec for building a strength workout from scratch
export interface StrengthSetSpec {
  [parameter: string]: string; // e.g. { "RepsPerSide": "8", "WeightPerSideKg": "20" }
}

export interface StrengthExerciseSpec {
  id: string; // library exercise ID (e.g. "5178")
  name: string; // display title
  sets_data: StrengthSetSpec[]; // one entry per set; all sets may differ
}

// ─── Strength parameter metadata ──────────────────────────────────────────────

const STRENGTH_PARAM_META: Record<
  string,
  { title: string; unit: { title: string; abbreviation: string; unit: string }; category: string }
> = {
  Reps: {
    title: "Reps",
    unit: { title: "Reps", abbreviation: "", unit: "Reps" },
    category: "Reps",
  },
  RepsPerSide: {
    title: "Reps/side",
    unit: { title: "Reps", abbreviation: "", unit: "Reps" },
    category: "Reps/side",
  },
  WeightKg: {
    title: "Weight kg",
    unit: { title: "Kilograms", abbreviation: "kg", unit: "Kilograms" },
    category: "Weight",
  },
  WeightLb: {
    title: "Weight lb",
    unit: { title: "Pounds", abbreviation: "lb", unit: "Pounds" },
    category: "Weight",
  },
  WeightPerSideKg: {
    title: "Weight/side kg",
    unit: { title: "Kilograms", abbreviation: "kg", unit: "Kilograms" },
    category: "Weight/side",
  },
  WeightPerSideLb: {
    title: "Weight/side lb",
    unit: { title: "Pounds", abbreviation: "lb", unit: "Pounds" },
    category: "Weight/side",
  },
  WeightPercentage: {
    title: "Weight %",
    unit: { title: "Percent", abbreviation: "%", unit: "Percent" },
    category: "Weight",
  },
  Duration: {
    title: "Duration (s)",
    unit: { title: "Seconds", abbreviation: "s", unit: "Seconds" },
    category: "Duration",
  },
  DistanceMeters: {
    title: "Distance (m)",
    unit: { title: "Meters", abbreviation: "m", unit: "Meters" },
    category: "Distance",
  },
  DistanceKm: {
    title: "Distance (km)",
    unit: { title: "Kilometers", abbreviation: "km", unit: "Kilometers" },
    category: "Distance",
  },
  DistanceFt: {
    title: "Distance (ft)",
    unit: { title: "Feet", abbreviation: "ft", unit: "Feet" },
    category: "Distance",
  },
  DistanceYd: {
    title: "Distance (yd)",
    unit: { title: "Yards", abbreviation: "yd", unit: "Yards" },
    category: "Distance",
  },
  DistanceMiles: {
    title: "Distance (mi)",
    unit: { title: "Miles", abbreviation: "mi", unit: "Miles" },
    category: "Distance",
  },
  HeightCm: {
    title: "Height (cm)",
    unit: { title: "Centimeters", abbreviation: "cm", unit: "Centimeters" },
    category: "Height",
  },
  HeightM: {
    title: "Height (m)",
    unit: { title: "Meters", abbreviation: "m", unit: "Meters" },
    category: "Height",
  },
  HeightIn: {
    title: "Height (in)",
    unit: { title: "Inches", abbreviation: "in", unit: "Inches" },
    category: "Height",
  },
  HeightFt: {
    title: "Height (ft)",
    unit: { title: "Feet", abbreviation: "ft", unit: "Feet" },
    category: "Height",
  },
  RPE: {
    title: "RPE",
    unit: { title: "RPE", abbreviation: "", unit: "RPE" },
    category: "Effort",
  },
  Cals: {
    title: "Calories",
    unit: { title: "Calories", abbreviation: "cal", unit: "Calories" },
    category: "Energy",
  },
  Watts: {
    title: "Watts",
    unit: { title: "Watts", abbreviation: "W", unit: "Watts" },
    category: "Power",
  },
  VelocityMetersPerSec: {
    title: "Velocity (m/s)",
    unit: { title: "Meters per second", abbreviation: "m/s", unit: "MetersPerSecond" },
    category: "Velocity",
  },
};

function strengthParamInputFormat(param: string): "Integer" | "Decimal" {
  return ["Reps", "RepsPerSide", "Duration", "RPE", "Cals"].includes(param) ? "Integer" : "Decimal";
}

function buildSetSummaryTemplate(params: string[]): string {
  const parts: string[] = [];
  const repsParam = params.find((p) => p === "Reps" || p === "RepsPerSide");
  if (repsParam) {
    parts.push(repsParam === "Reps" ? `{Reps} Reps` : `{RepsPerSide} Reps/side`);
  }
  if (params.includes("Duration")) {
    parts.push(`{Duration} sec`);
  }
  const weightParam = params.find((p) => p.startsWith("Weight"));
  if (weightParam) {
    const unit = weightParam.includes("Kg") ? "kg" : "lb";
    parts.push(`@ {${weightParam}} ${unit}`);
  }
  if (parts.length > 0) return parts.join(" ");
  return params.map((p) => `{${p}}`).join(" ");
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function createStrengthWorkout(
  date: string,
  title: string,
  exercises: StrengthExerciseSpec[]
): Promise<StrengthWorkout> {
  const athleteId = await getAthleteId();

  let totalSets = 0;

  const blocks = exercises.map((ex) => {
    const paramNames = [...new Set(ex.sets_data.flatMap((s) => Object.keys(s)))];

    const prescriptionParams = paramNames.map((p) => ({
      parameter: p,
      title: STRENGTH_PARAM_META[p]?.title ?? p,
      unit: STRENGTH_PARAM_META[p]?.unit ?? { title: p, abbreviation: "", unit: p },
      category: STRENGTH_PARAM_META[p]?.category ?? p,
      id: randomUUID(),
    }));

    const exerciseParams = paramNames.map((p) => ({
      parameter: p,
      title: STRENGTH_PARAM_META[p]?.title ?? p,
      unit: STRENGTH_PARAM_META[p]?.unit ?? { title: p, abbreviation: "", unit: p },
      category: STRENGTH_PARAM_META[p]?.category ?? p,
      id: "0",
    }));

    const sets = ex.sets_data.map((setData) => ({
      id: randomUUID(),
      isComplete: false,
      setOrigin: "Prescribed" as const,
      parameterValues: Object.entries(setData).map(([param, value]) => ({
        id: randomUUID(),
        parameter: param,
        inputFormat: strengthParamInputFormat(param),
        prescribedValue: value,
        executedValue: null,
      })),
    }));

    totalSets += sets.length;

    return {
      id: randomUUID(),
      blockType: "SingleExercise" as const,
      title: ex.name,
      coachNotes: null,
      isComplete: false,
      compliancePercent: 0,
      parameters: [],
      prescriptions: [
        {
          id: randomUUID(),
          exercise: {
            id: ex.id,
            title: ex.name,
            videoUrl: null,
            instructions: null,
            parameters: exerciseParams,
            canEdit: false,
          },
          parameters: prescriptionParams,
          sets,
          coachNotes: null,
          compliancePercent: 0,
          setSummaryTemplate: buildSetSummaryTemplate(paramNames),
        },
      ],
    };
  });

  const workout = {
    workoutType: "StructuredStrength" as const,
    lastUpdatedAt: null,
    compliancePercent: 0,
    rpe: null,
    feel: null,
    blocks,
    snapshot: {
      totalBlocks: blocks.length,
      completedBlocks: 0,
      totalSets,
      completedSets: 0,
      totalPrescriptions: blocks.length,
      completedPrescriptions: 0,
    },
    prescribedDate: date,
    prescribedStartTime: null,
    startDateTime: null,
    completedDateTime: null,
    calendarId: athleteId,
    title,
    instructions: null,
    prescribedDurationInSeconds: null,
    orderOnDay: null,
    executedDurationInSeconds: null,
    isLocked: false,
    isHidden: false,
    workoutSubTypeId: null,
    id: randomUUID(),
  };

  const resp = await strengthApi<{
    data: StrengthWorkout;
    errors: Record<string, unknown>;
  }>({
    method: "post",
    path: "/rx/activity/v1/workouts/save",
    data: workout,
  });

  if (resp.errors && Object.keys(resp.errors).length > 0) {
    throw new Error(`Strength workout creation errors: ${JSON.stringify(resp.errors)}`);
  }

  return resp.data;
}

export async function getStrengthWorkoutSummary(
  workoutId: string
): Promise<StrengthWorkoutSummary> {
  const resp = await strengthApi<{
    data: StrengthWorkoutSummary;
    errors: Record<string, unknown>;
  }>({
    method: "get",
    path: `/rx/activity/v1/workouts/${workoutId}/summary`,
  });
  return resp.data;
}

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerStrengthTools(mcp: McpServer): void {
  mcp.registerTool(
    "create_strength_workout",
    {
      description:
        "Create a structured strength/weight training workout on the TrainingPeaks calendar. " +
        "Uses the TrainingPeaks strength platform (api.peakswaresb.com). " +
        "Each exercise requires a library ID and per-set parameter values (reps, weight, etc.).",
      inputSchema: {
        date: z.string().describe("Workout date in YYYY-MM-DD format"),
        title: z.string().describe("Workout title"),
        exercises: z
          .array(
            z.object({
              id: z
                .string()
                .describe(
                  "TrainingPeaks library exercise ID (numeric string, e.g. '5178'). " +
                    "Use known exercise IDs from previous searches or user input."
                ),
              name: z
                .string()
                .describe("Exercise display name (e.g. '90-90', 'Alternating DB Press')"),
              sets_data: z
                .array(z.record(z.string(), z.string()))
                .describe(
                  "One object per set. Each key is a parameter name and value is the prescribed amount as a string. " +
                    "Parameter names: Reps, RepsPerSide, WeightKg, WeightLb, WeightPerSideKg, WeightPerSideLb, WeightPercentage, " +
                    "Duration (seconds), DistanceMeters, DistanceKm, DistanceFt, DistanceYd, DistanceMiles, " +
                    "HeightCm, HeightM, HeightIn, HeightFt, RPE, Cals, Watts, VelocityMetersPerSec. " +
                    'Example: [{"Reps": "10"}, {"Reps": "10"}, {"Reps": "10"}] for 3 sets of 10 reps. ' +
                    'Or [{"RepsPerSide": "8", "WeightPerSideKg": "15"}, {"RepsPerSide": "8", "WeightPerSideKg": "20"}] for progressive loading.'
                ),
            })
          )
          .describe("List of exercises in the workout"),
      },
    },
    async ({ date, title, exercises }) => {
      const workout = await createStrengthWorkout(date, title, exercises);
      const lines: string[] = [
        `Strength workout created: ${workout.title}`,
        `ID: ${workout.id}`,
        `Date: ${workout.prescribedDate}`,
        `Exercises: ${workout.snapshot.totalBlocks}`,
        `Total sets: ${workout.snapshot.totalSets}`,
        "",
        "Exercises:",
      ];
      for (const block of workout.blocks) {
        const ex = block.prescriptions[0]?.exercise;
        const sets = block.prescriptions[0]?.sets ?? [];
        const template = block.prescriptions[0]?.setSummaryTemplate ?? "";
        const sample = sets[0]
          ? template.replace(
              /\{(\w+)\}/g,
              (_, p) =>
                sets[0].parameterValues.find((v) => v.parameter === p)?.prescribedValue ?? "?"
            )
          : "";
        lines.push(
          `  • ${block.title ?? ex?.title ?? "?"} — ${sets.length} sets ${sample ? `(e.g. ${sample})` : ""}`
        );
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "get_strength_workout_summary",
    {
      description:
        "Get the summary of a structured strength workout, including exercise list, sets completed, and compliance.",
      inputSchema: {
        workout_id: z
          .string()
          .describe("Strength workout ID (numeric string returned by create_strength_workout)"),
      },
    },
    async ({ workout_id }) => {
      const summary = await getStrengthWorkoutSummary(workout_id);
      const lines: string[] = [
        `${summary.title} — ${summary.prescribedDate}`,
        `ID: ${summary.id}`,
        `Type: ${summary.workoutType}`,
        `Status: ${summary.completedSets}/${summary.totalSets} sets completed (${Math.round(summary.compliancePercent)}% compliance)`,
      ];
      if (summary.rpe !== null) lines.push(`RPE: ${summary.rpe}`);
      if (summary.feel !== null) lines.push(`Feel: ${summary.feel}`);
      if (summary.prescribedDurationInSeconds) {
        lines.push(
          `Prescribed duration: ${Math.round(summary.prescribedDurationInSeconds / 60)} min`
        );
      }
      if (summary.executedDurationInSeconds) {
        lines.push(`Actual duration: ${Math.round(summary.executedDurationInSeconds / 60)} min`);
      }
      if (summary.sequenceSummary?.length > 0) {
        lines.push("", "Exercises:");
        for (const s of summary.sequenceSummary) {
          lines.push(
            `  ${s.sequenceOrder}. ${s.title} — ${Math.round(s.compliancePercent)}% complete`
          );
        }
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}
