import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "../api.js";
import { getAthleteId } from "../auth.js";
import { getFitnessMetrics } from "./fitness.js";

export interface Workout {
  workoutId: number;
  athleteId: number;
  workoutDay: string;
  title: string;
  workoutTypeValueId: number;
  workoutSubTypeId?: number | null; // confirmed field name from GET response (not workoutSubTypeValueId)
  workoutTypeFamilyId?: number;
  totalTimePlanned?: number; // hours as float
  totalTime?: number; // hours as float
  startTimePlanned?: string | null;
  startTime?: string | null;
  tssPlanned?: number;
  tssActual?: number;
  description?: string | null;
  coachComments?: string | null;
  athleteComments?: string | null;
  completed?: boolean | null;
  distancePlanned?: number | null;
  distance?: number | null;
  velocityPlanned?: number | null; // m/s
  velocityAverage?: number | null; // m/s
  powerAverage?: number | null;
  normalizedPowerActual?: number | null;
  heartRateAverage?: number | null;
  cadenceAverage?: number | null;
  elevationGain?: number | null;
  calories?: number | null;
  ifPlanned?: number | null;
  if?: number | null;
  feeling?: number | null; // 0–10 athlete feel rating
  rpe?: number | null; // 1–10 rate of perceived exertion
  userTags?: string; // comma-separated string (empty string when none)
  poolLengthOptionId?: string | null;
  orderOnDay?: number;
  personalRecordCount?: number;
  isHidden?: boolean | null;
  // TP API returns structure as a parsed object in GET responses,
  // but expects a double-serialized JSON string in POST/PUT payloads (confirmed from devtools capture).
  structure?: string | Record<string, unknown>;
}

// Create/update workout payload — field types match what the TP web app sends on POST.
export interface WorkoutPayload {
  athleteId?: number;
  workoutDay: string;
  workoutTypeValueId: number;
  workoutSubTypeId?: number | null; // optional subtype (e.g. Road Bike=3, Trail Run=12, Yoga=22)
  title: string;
  description?: string | null;
  coachComments?: string | null;
  athleteComments?: string | null;
  totalTimePlanned?: number | null; // hours as float
  distancePlanned?: number | null; // meters
  tssPlanned?: number | null;
  tssActual?: number | null;
  feeling?: number | null; // 0–10 athlete feel rating
  rpe?: number | null; // 1–10 rate of perceived exertion
  orderOnDay?: number | null;
  structure?: string; // JSON string (double-serialized by axios)
  userTags?: string; // comma-separated string (NOT an array — TP API rejects arrays)
}

// Sport type enum
export const SportTypeId = {
  Swim: 1,
  Bike: 2,
  Run: 3,
  Brick: 4,
  Crosstrain: 5,
  Race: 6,
  Note: 7,
  MTB: 8,
  WeightTraining: 9,
  Custom: 10,
  XCSki: 11,
  Rowing: 12,
  Walk: 13,
  StrengthPlus: 29, // Strength with subtypes (Mobility, Yoga, etc.)
  Other: 100,
} as const;

export type SportName =
  | "swim"
  | "bike"
  | "run"
  | "brick"
  | "crosstrain"
  | "race"
  | "note"
  | "mtb"
  | "weights"
  | "custom"
  | "walk"
  | "ski"
  | "rowing"
  | "strength_plus"
  | "other";

export const SportNameToId: Record<SportName, number> = {
  swim: SportTypeId.Swim,
  bike: SportTypeId.Bike,
  run: SportTypeId.Run,
  brick: SportTypeId.Brick,
  crosstrain: SportTypeId.Crosstrain,
  race: SportTypeId.Race,
  note: SportTypeId.Note,
  mtb: SportTypeId.MTB,
  weights: SportTypeId.WeightTraining,
  custom: SportTypeId.Custom,
  walk: SportTypeId.Walk,
  ski: SportTypeId.XCSki,
  rowing: SportTypeId.Rowing,
  strength_plus: SportTypeId.StrengthPlus,
  other: SportTypeId.Other,
};

// ─── Workout type catalogue from GET /fitness/v6/workouttypes ────────────────

export interface WorkoutSubType {
  id: number;
  name: string;
}

export interface WorkoutType {
  id: number;
  name: string;
  subTypes: WorkoutSubType[];
}

// Valid intensityClass values observed in TP API requests
export type IntensityClass = "warmUp" | "active" | "rest" | "coolDown" | "recovery" | "other";

// Structure types matching the TP API wire format (confirmed from browser devtools capture)
export interface StructureTarget {
  minValue: number;
  maxValue: number;
  unit?: string; // only for cadence: "roundOrStridePerMinute"; omit entirely for primary intensity
}

export interface StructureStep {
  name: string;
  type?: "step"; // present only on inner steps of repetition blocks, not on steps inside step blocks
  length: { value: number; unit: string };
  targets: StructureTarget[];
  intensityClass: IntensityClass;
  openDuration: boolean;
}

export interface StructureBlock {
  type: "step" | "repetition" | "rampUp" | "rampDown";
  length: { value: number; unit: string };
  steps: StructureStep[];
  begin: number; // cumulative seconds at block start
  end: number; // cumulative seconds at block end
}

export interface WorkoutStructure {
  structure: StructureBlock[];
  polyline: [number, number][]; // normalized [time, intensity] pairs for visualization
  primaryLengthMetric: string;
  primaryIntensityMetric: string;
  primaryIntensityTargetOrRange: "range" | "target";
}

// Simplified input format for LLM to specify workout structure
export interface SimpleWorkoutStep {
  name: string;
  type?: "step" | "repetition";
  duration_seconds?: number;
  intensity_min?: number;
  intensity_max?: number;
  intensityClass?: IntensityClass; // warmUp | active | rest | coolDown | recovery | other
  reps?: number;
  steps?: SimpleWorkoutStep[];
  cadence_min?: number;
  cadence_max?: number;
}

export interface SimpleWorkoutStructure {
  primaryIntensityMetric?: "percentOfFtp" | "percentOfThresholdHr" | "percentOfThresholdPace";
  steps: SimpleWorkoutStep[];
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getWorkoutTypes(): Promise<WorkoutType[]> {
  return api<WorkoutType[]>({ method: "get", path: "/fitness/v6/workouttypes" });
}

export async function getWorkouts(startDate: string, endDate: string): Promise<Workout[]> {
  const athleteId = await getAthleteId();
  return api<Workout[]>({
    method: "get",
    path: `/fitness/v6/athletes/${athleteId}/workouts/${startDate}/${endDate}`,
  });
}

export async function getWorkout(workoutId: number): Promise<Workout> {
  const athleteId = await getAthleteId();
  return api<Workout>({
    method: "get",
    path: `/fitness/v6/athletes/${athleteId}/workouts/${workoutId}`,
  });
}

// Compute IF (Intensity Factor), TSS, and energy from a workout structure.
// Uses NP-style calculation: time-weighted 4th-power average of midpoint intensities.
// This matches the client-side computation the TP web app performs before POST.
export function computeStructureMetrics(
  structure: WorkoutStructure,
  ftpWatts?: number
): {
  totalSeconds: number;
  ifPlanned: number;
  tssPlanned: number;
  energyPlanned: number | null;
} | null {
  const blocks = structure.structure;
  if (!blocks.length) return null;

  const totalSeconds = blocks[blocks.length - 1].end;
  if (totalSeconds === 0) return null;

  let weightedSum = 0;
  for (const block of blocks) {
    const reps = block.type === "repetition" ? block.length.value : 1;
    for (const step of block.steps) {
      const primary = step.targets.find((t) => !t.unit);
      if (!primary) continue;
      const midpoint = (primary.minValue + primary.maxValue) / 2;
      weightedSum += reps * step.length.value * midpoint ** 4;
    }
  }

  const np = (weightedSum / totalSeconds) ** 0.25;
  const ifPlanned = Math.round((np / 100) * 100) / 100; // 2 decimal places
  const tssPlanned = Math.round(((totalSeconds * ifPlanned ** 2 * 100) / 3600) * 10) / 10; // 1 decimal
  const energyPlanned = ftpWatts
    ? Math.round(ftpWatts * ifPlanned * (totalSeconds / 1000) * 100) / 100
    : null;

  return { totalSeconds, ifPlanned, tssPlanned, energyPlanned };
}

export async function createWorkout(data: WorkoutPayload): Promise<Workout> {
  const athleteId = await getAthleteId();

  // Compute duration, IF, TSS, and energy from structure (like the TP web app does).
  let totalTimePlanned = data.totalTimePlanned;
  let tssPlanned = data.tssPlanned;
  let ifPlanned: number | null = null;
  let energyPlanned: number | null = null;

  if (data.structure) {
    try {
      const parsed = JSON.parse(data.structure) as WorkoutStructure;
      const metrics = computeStructureMetrics(parsed);
      if (metrics) {
        if (totalTimePlanned === undefined) totalTimePlanned = metrics.totalSeconds / 3600;
        if (tssPlanned === undefined) tssPlanned = metrics.tssPlanned;
        ifPlanned = metrics.ifPlanned;
        energyPlanned = metrics.energyPlanned;
      }
    } catch {
      /* structure already validated upstream */
    }
  }

  // Match the payload format the TP web app sends — all fields present (even null),
  // athleteId as number, userTags as string, workoutId: 0 for new workouts.
  return api<Workout>({
    method: "post",
    path: `/fitness/v6/athletes/${athleteId}/workouts`,
    data: {
      athleteId,
      workoutId: 0,
      workoutDay: data.workoutDay,
      workoutTypeValueId: data.workoutTypeValueId,
      workoutSubTypeId: data.workoutSubTypeId ?? null,
      title: data.title,
      description: data.description ?? null,
      coachComments: data.coachComments ?? null,
      athleteComments: data.athleteComments ?? null,
      totalTimePlanned: totalTimePlanned ?? null,
      distancePlanned: data.distancePlanned ?? null,
      tssPlanned: tssPlanned ?? null,
      ifPlanned,
      energyPlanned,
      feeling: data.feeling ?? null,
      rpe: data.rpe ?? null,
      orderOnDay: data.orderOnDay ?? null,
      structure: data.structure ?? null,
      userTags: data.userTags ?? "",
      workoutComments: [],
    },
  });
}

export async function updateWorkout(
  workoutId: number,
  data: Partial<WorkoutPayload>
): Promise<Workout> {
  const athleteId = await getAthleteId();
  if (data.structure !== undefined) {
    process.stderr.write(
      `[TP] updateWorkout structure payload (${data.structure.length} chars): ${data.structure.slice(0, 500)}\n`
    );
  }
  // TP API requires the full workout object on PUT, not just changed fields.
  // GET the existing workout, merge updates, then PUT the complete object.
  const existing = await getWorkout(workoutId);
  const merged = { ...existing, ...data, athleteId };
  // Ensure structure is serialized as a JSON string for the API
  if (
    merged.structure !== undefined &&
    merged.structure !== null &&
    typeof merged.structure !== "string"
  ) {
    merged.structure = JSON.stringify(merged.structure);
  }
  return api<Workout>({
    method: "put",
    path: `/fitness/v6/athletes/${athleteId}/workouts/${workoutId}`,
    data: merged,
  });
}

export async function deleteWorkout(workoutId: number): Promise<boolean> {
  const athleteId = await getAthleteId();
  return api<boolean>({
    method: "delete",
    path: `/fitness/v6/athletes/${athleteId}/workouts/${workoutId}`,
  });
}

// ─── Workout comments ────────────────────────────────────────────────────────

export interface WorkoutComment {
  id: number;
  comment: string;
  dateCreated: string;
  workoutId: number;
  commenterPersonId: number;
  firstName: string;
  lastName: string;
  commenterName: string;
  commenterPhotoUrl: string;
  isCoach: boolean;
}

export async function getWorkoutComments(workoutId: number): Promise<WorkoutComment[]> {
  const athleteId = await getAthleteId();
  return api<WorkoutComment[]>({
    method: "get",
    path: `/fitness/v2/athletes/${athleteId}/workouts/${workoutId}/comments`,
  });
}

export async function addWorkoutComment(
  workoutId: number,
  comment: string
): Promise<WorkoutComment[]> {
  const athleteId = await getAthleteId();
  return api<WorkoutComment[]>({
    method: "post",
    path: `/fitness/v2/athletes/${athleteId}/workouts/${workoutId}/comments`,
    data: { value: comment },
  });
}

export async function deleteWorkoutComment(workoutId: number, commentId: number): Promise<void> {
  const athleteId = await getAthleteId();
  await api<WorkoutComment[]>({
    method: "delete",
    path: `/fitness/v2/athletes/${athleteId}/workouts/${workoutId}/comments/${commentId}`,
  });
}

// ─── Private workout notes ───────────────────────────────────────────────────

export async function updatePrivateWorkoutNote(workoutId: number, note: string): Promise<void> {
  await api<void>({
    method: "put",
    path: `/fitness/v6/workouts/${workoutId}/privateWorkoutNote`,
    data: { note },
  });
}

// ─── Display utilities (also used by library.ts) ──────────────────────────────

export function formatDuration(hours?: number): string {
  if (!hours) return "N/A";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function sportIdToName(id: number): string {
  const map: Record<number, string> = {
    1: "Swim",
    2: "Bike",
    3: "Run",
    4: "Brick",
    5: "Crosstrain",
    6: "Race",
    7: "Note",
    8: "MTB",
    9: "Weights",
    10: "Custom",
    11: "XC Ski",
    12: "Rowing",
    13: "Walk",
    29: "Strength+",
    100: "Other",
  };
  return map[id] ?? `Sport(${id})`;
}

export function formatWorkoutSummary(w: {
  workoutId: number;
  workoutDay: string;
  title?: string | null;
  workoutTypeValueId?: number;
  totalTimePlanned?: number | null;
  totalTime?: number | null;
  tssPlanned?: number | null;
  tssActual?: number | null;
  completed?: boolean | null;
  heartRateAverage?: number | null;
  powerAverage?: number | null;
  normalizedPowerActual?: number | null;
  distance?: number | null;
  athleteComments?: string | null;
}): string {
  const lines = [
    `ID: ${w.workoutId}`,
    `Date: ${w.workoutDay}`,
    `Title: ${w.title ?? "Untitled"}`,
    `Sport: ${sportIdToName(w.workoutTypeValueId ?? 0)}`,
    `Status: ${w.completed ? "Completed" : "Planned"}`,
    `Duration: ${formatDuration(w.totalTime ?? w.totalTimePlanned ?? undefined)}`,
    `TSS: ${w.tssActual ?? w.tssPlanned ?? "N/A"}`,
  ];
  if (w.heartRateAverage) lines.push(`Avg HR: ${w.heartRateAverage} bpm`);
  if (w.powerAverage) lines.push(`Avg Power: ${w.powerAverage}W`);
  if (w.normalizedPowerActual) lines.push(`NP: ${w.normalizedPowerActual}W`);
  if (w.distance) lines.push(`Distance: ${(w.distance / 1000).toFixed(1)} km`);
  if (w.athleteComments) lines.push(`Athlete notes: ${w.athleteComments}`);
  return lines.join("\n");
}

// ─── Workout structure builder ────────────────────────────────────────────────

function buildStep(step: SimpleWorkoutStep, innerStep = false): StructureStep {
  const targets: StructureTarget[] = [];

  if (step.intensity_min !== undefined && step.intensity_max !== undefined) {
    targets.push({ minValue: step.intensity_min, maxValue: step.intensity_max });
  }

  if (step.cadence_min !== undefined && step.cadence_max !== undefined) {
    targets.push({
      minValue: step.cadence_min,
      maxValue: step.cadence_max,
      unit: "roundOrStridePerMinute",
    });
  }

  // The TP API rejects "recovery" as an intensityClass — map it to "rest" which
  // the API accepts in all contexts (both within repetition blocks and standalone).
  const cls = step.intensityClass ?? "active";

  const result: StructureStep = {
    name: step.name,
    length: { value: step.duration_seconds ?? 0, unit: "second" },
    targets,
    intensityClass: cls === "recovery" ? "rest" : cls,
    openDuration: false,
  };

  if (innerStep) result.type = "step";
  return result;
}

function buildPolyline(blocks: StructureBlock[]): [number, number][] {
  const totalDuration = blocks.length > 0 ? blocks[blocks.length - 1].end : 0;
  if (totalDuration === 0) return [];

  let maxIntensity = 0;
  for (const block of blocks) {
    for (const step of block.steps) {
      const primary = step.targets.find((t) => !t.unit);
      if (primary && primary.maxValue > maxIntensity) maxIntensity = primary.maxValue;
    }
  }
  if (maxIntensity === 0) return [];

  const r = (n: number) => Math.round(n * 1000) / 1000;
  const points: [number, number][] = [[0, 0]];
  let cursor = 0;

  for (const block of blocks) {
    const reps = block.type === "repetition" ? block.length.value : 1;
    for (let rep = 0; rep < reps; rep++) {
      for (const step of block.steps) {
        const dur = step.length.value;
        const primary = step.targets.find((t) => !t.unit);
        const y = primary ? r(primary.maxValue / maxIntensity) : 0;
        points.push([r(cursor / totalDuration), y]);
        points.push([r((cursor + dur) / totalDuration), y]);
        points.push([r((cursor + dur) / totalDuration), 0]);
        cursor += dur;
      }
    }
  }

  return points;
}

export function wrapWorkoutBlocks(input: {
  primaryIntensityMetric?: string;
  steps: StructureBlock[];
}): string {
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error("Structure must have at least one step block.");
  }
  let cursor = 0;
  const blocks: StructureBlock[] = input.steps.map((block, i) => {
    if (!Array.isArray(block.steps) || block.steps.length === 0) {
      const label = block.type ?? "block";
      throw new Error(
        `${label} at index ${i} has no steps array — each top-level block must contain at least one interval.`
      );
    }
    for (const [j, step] of block.steps.entries()) {
      if (!step.length || typeof step.length.value !== "number" || step.length.value <= 0) {
        throw new Error(
          `Step "${step.name ?? j}" in block ${i} has no valid duration (length.value must be a positive number).`
        );
      }
    }
    const begin = cursor;
    const reps = block.type === "repetition" ? block.length.value : 1;
    const innerTotal = block.steps.reduce((s, step) => s + step.length.value, 0);
    cursor += reps * innerTotal;
    return { ...block, begin, end: cursor };
  });

  const structure: WorkoutStructure = {
    structure: blocks,
    polyline: buildPolyline(blocks),
    primaryLengthMetric: "duration",
    primaryIntensityMetric: input.primaryIntensityMetric ?? "percentOfFtp",
    primaryIntensityTargetOrRange: "range",
  };

  return JSON.stringify(structure);
}

export function buildWorkoutStructure(input: SimpleWorkoutStructure): string {
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error("Structure must have at least one step.");
  }
  const blocks: StructureBlock[] = input.steps.map((step, i) => {
    if (step.type === "repetition") {
      if (!Array.isArray(step.steps) || step.steps.length === 0) {
        throw new Error(
          `Repetition block "${step.name ?? `at index ${i}`}" must have a steps array with at least one inner interval.`
        );
      }
      for (const [j, inner] of step.steps.entries()) {
        if (!inner.duration_seconds || inner.duration_seconds <= 0) {
          throw new Error(
            `Inner step "${inner.name ?? j}" in repetition "${step.name ?? i}" has no valid duration_seconds.`
          );
        }
      }
      return {
        type: "repetition" as const,
        length: { value: step.reps ?? 1, unit: "repetition" },
        steps: (step.steps ?? []).map((s) => buildStep(s, true)),
        begin: 0,
        end: 0,
      };
    } else {
      if (!step.duration_seconds || step.duration_seconds <= 0) {
        throw new Error(`Step "${step.name ?? `at index ${i}`}" has no valid duration_seconds.`);
      }
      return {
        type: "step" as const,
        length: { value: 1, unit: "repetition" },
        steps: [buildStep(step, false)],
        begin: 0,
        end: 0,
      };
    }
  });

  return wrapWorkoutBlocks({
    primaryIntensityMetric: input.primaryIntensityMetric,
    steps: blocks,
  });
}

export function resolveStructure(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Structure is not valid JSON: ${raw.slice(0, 200)}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error('Structure must be a JSON object with a "steps" array.');
  }

  const obj = parsed as Record<string, unknown>;

  // Handle case where LLM passes a fully-formed WorkoutStructure (with "structure" key at root,
  // e.g. copied from get_workout output)
  if (Array.isArray(obj.structure) && !Array.isArray(obj.steps)) {
    return wrapWorkoutBlocks({
      primaryIntensityMetric: (obj.primaryIntensityMetric as string) ?? undefined,
      steps: obj.structure as StructureBlock[],
    });
  }

  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new Error('Structure must have a "steps" array with at least one step.');
  }

  const steps = obj.steps as Record<string, unknown>[];

  // Detect format: simple (has duration_seconds/intensity_min/reps) vs wire (has length.unit/openDuration/targets)
  const hasSimpleFields = steps.some(
    (s) => "duration_seconds" in s || "intensity_min" in s || "reps" in s
  );

  if (hasSimpleFields) {
    return buildWorkoutStructure(parsed as SimpleWorkoutStructure);
  }

  const first = steps[0];
  const hasWireFields =
    first.length !== null &&
    typeof first.length === "object" &&
    typeof (first.length as Record<string, unknown>).unit === "string";

  if (hasWireFields) {
    return wrapWorkoutBlocks(obj as { primaryIntensityMetric?: string; steps: StructureBlock[] });
  }

  throw new Error(
    "Could not determine structure format. Use the simple format with " +
      "duration_seconds, intensity_min, intensity_max on each step."
  );
}

// ─── Week bounds helper ───────────────────────────────────────────────────────

function getWeekBounds(date?: string): { start: string; end: string } {
  const d = date ? new Date(date) : new Date();
  const day = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

// ─── Tool registration ───────────────────────────────────────────────────────

const SPORT_ENUM = [
  "swim",
  "bike",
  "run",
  "brick",
  "crosstrain",
  "race",
  "note",
  "mtb",
  "weights",
  "custom",
  "walk",
  "ski",
  "rowing",
  "strength_plus",
  "other",
] as const;

const STRUCTURE_DESCRIPTION =
  'Interval structure as a JSON string. Format: {"steps": [...], "primaryIntensityMetric": "percentOfFtp"|"percentOfThresholdHr"|"percentOfThresholdPace"}. ' +
  "Each step is either a single interval or a repetition block. " +
  'SINGLE: {"name":"Warm Up","duration_seconds":600,"intensity_min":40,"intensity_max":55,"intensityClass":"warmUp"}. ' +
  'REPETITION: {"type":"repetition","reps":4,"steps":[' +
  '{"name":"Hard","duration_seconds":300,"intensity_min":90,"intensity_max":100,"intensityClass":"active"},' +
  '{"name":"Easy","duration_seconds":120,"intensity_min":50,"intensity_max":60,"intensityClass":"rest"}]}. ' +
  "MULTIPLE SETS with recovery between them — alternate repetition and single steps: " +
  '[{"type":"repetition","reps":3,"steps":[...]}, ' +
  '{"name":"Set Recovery","duration_seconds":300,"intensity_min":40,"intensity_max":55,"intensityClass":"rest"}, ' +
  '{"type":"repetition","reps":3,"steps":[...]}]. ' +
  "intensityClass: warmUp for warm-up, active for work intervals, rest for all recovery (within or between sets), coolDown for cool-down, other for anything else. " +
  "Intensity values are % of threshold (FTP/HR/pace). Optional: cadence_min, cadence_max (rpm).";

export function registerWorkoutTools(mcp: McpServer): void {
  mcp.registerTool(
    "get_workout_types",
    {
      description:
        "Get all available workout types and their sub-types (e.g. Road Bike, Trail Run, Yoga) with their IDs",
    },
    async () => {
      const types = await getWorkoutTypes();
      const lines: string[] = [];
      for (const t of types) {
        lines.push(`${t.name} (id: ${t.id})`);
        for (const s of t.subTypes) {
          lines.push(`  └ ${s.name} (id: ${s.id})`);
        }
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "get_workouts",
    {
      description: "List workouts in a date range (max 90 days)",
      inputSchema: {
        start_date: z.string().describe("Start date YYYY-MM-DD"),
        end_date: z.string().describe("End date YYYY-MM-DD (max 90 days from start)"),
      },
    },
    async ({ start_date, end_date }) => {
      const workouts = await getWorkouts(start_date, end_date);
      if (workouts.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No workouts found in the specified date range." },
          ],
        };
      }
      const text = workouts.map(formatWorkoutSummary).join("\n\n---\n\n");
      return {
        content: [
          { type: "text" as const, text: `Found ${workouts.length} workout(s):\n\n${text}` },
        ],
      };
    }
  );

  mcp.registerTool(
    "get_workout",
    {
      description: "Get full details of a single workout including interval structure",
      inputSchema: {
        workout_id: z.number().describe("The workout ID"),
      },
    },
    async ({ workout_id }) => {
      const workout = await getWorkout(workout_id);
      const lines = [
        formatWorkoutSummary(workout),
        `URL: https://app.trainingpeaks.com/athlete/workout/${workout.workoutId}`,
        workout.description ? `\nDescription:\n${workout.description}` : "",
        workout.coachComments ? `\nCoach notes:\n${workout.coachComments}` : "",
      ].filter(Boolean);
      if (workout.structure) {
        try {
          const structureObj =
            typeof workout.structure === "string"
              ? JSON.parse(workout.structure)
              : workout.structure;
          lines.push(`\nInterval Structure:\n${JSON.stringify(structureObj, null, 2)}`);
        } catch {
          lines.push(`\nStructure (raw):\n${String(workout.structure)}`);
        }
      }
      return { content: [{ type: "text" as const, text: lines.join("") }] };
    }
  );

  mcp.registerTool(
    "get_weekly_summary",
    {
      description: "Get workouts and CTL/ATL/TSB fitness metrics for a given week",
      inputSchema: {
        week_of: z
          .string()
          .optional()
          .describe("Any date in the desired week (YYYY-MM-DD). Defaults to current week."),
      },
    },
    async ({ week_of }) => {
      const { start, end } = getWeekBounds(week_of);
      const [workouts, metrics] = await Promise.all([
        getWorkouts(start, end),
        getFitnessMetrics(start, end),
      ]);

      const totalTss = workouts.reduce((sum, w) => sum + (w.tssActual ?? 0), 0);
      const totalTime = workouts.reduce((sum, w) => sum + (w.totalTime ?? 0), 0);
      const latestMetric = metrics[metrics.length - 1];

      const lines = [
        `Week of ${start} to ${end}`,
        `\n## Workouts (${workouts.length})`,
        workouts.length === 0
          ? "No workouts this week."
          : workouts.map(formatWorkoutSummary).join("\n\n---\n\n"),
        `\n## Weekly Totals`,
        `Total TSS: ${totalTss}`,
        `Total Duration: ${formatDuration(totalTime)}`,
        `\n## Fitness Metrics (end of week)`,
        latestMetric
          ? [
              `CTL (fitness): ${latestMetric.ctl.toFixed(1)}`,
              `ATL (fatigue): ${latestMetric.atl.toFixed(1)}`,
              `TSB (form):    ${latestMetric.tsb.toFixed(1)}`,
            ].join("\n")
          : "No metrics available.",
      ];

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "create_workout",
    {
      description: "Create a planned workout, optionally with interval structure",
      inputSchema: {
        date: z.string().describe("Workout date in YYYY-MM-DD format"),
        sport: z
          .enum(SPORT_ENUM)
          .describe(
            "Sport type. Use 'note' for a Day Off or rest day. Use 'strength_plus' for structured strength (Mobility, Yoga, etc.)."
          ),
        subtype_id: z
          .number()
          .int()
          .optional()
          .describe(
            "Workout sub-type ID (e.g. 3=Road Bike, 12=Trail Run, 22=Yoga). Use get_workout_types to see all options."
          ),
        title: z.string().describe("Workout title"),
        description: z.string().optional().describe("Workout description / notes"),
        duration_hours: z
          .number()
          .optional()
          .describe(
            "Planned duration in hours (e.g. 1.5 = 90 min). Computed automatically from structure if provided — only supply when there is no structure or to override."
          ),
        distance_planned: z.number().optional().describe("Planned distance in meters"),
        tss: z
          .number()
          .optional()
          .describe(
            "Planned Training Stress Score. Computed automatically from structure if provided — only supply when there is no structure or to override."
          ),
        tags: z.string().optional().describe("Comma-separated tags (e.g. 'easy,recovery')"),
        structure: z.string().optional().describe(STRUCTURE_DESCRIPTION),
      },
    },
    async (params) => {
      const structureStr = params.structure ? resolveStructure(params.structure) : undefined;
      const workout = await createWorkout({
        workoutDay: params.date,
        workoutTypeValueId: SportNameToId[params.sport],
        ...(params.subtype_id !== undefined && { workoutSubTypeId: params.subtype_id }),
        title: params.title,
        description: params.description,
        totalTimePlanned: params.duration_hours,
        distancePlanned: params.distance_planned,
        tssPlanned: params.tss,
        structure: structureStr,
        ...(params.tags !== undefined && {
          userTags: params.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .join(","),
        }),
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Workout created successfully!\n\n${formatWorkoutSummary(workout)}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "update_workout",
    {
      description:
        "Update fields of an existing workout (title, notes, rating, date, duration, etc.)",
      inputSchema: {
        workout_id: z.number().describe("The workout ID to update"),
        sport: z.enum(SPORT_ENUM).optional().describe("New sport type"),
        subtype_id: z.number().int().optional().describe("New workout sub-type ID"),
        title: z.string().optional().describe("New workout title"),
        description: z.string().optional().describe("New workout description"),
        date: z.string().optional().describe("New date in YYYY-MM-DD format"),
        duration_hours: z.number().optional().describe("New planned duration in hours"),
        tss: z.number().optional().describe("New planned TSS"),
        distance_planned: z.number().optional().describe("Planned distance in meters"),
        tags: z.string().optional().describe("Comma-separated tags (e.g. 'easy,recovery')"),
        athlete_comment: z
          .string()
          .optional()
          .describe("Athlete rating/comment (e.g. '8/10 - felt strong')"),
        coach_comment: z.string().optional().describe("Coach comment/notes"),
        feeling: z
          .number()
          .min(0)
          .max(10)
          .optional()
          .describe("How the athlete felt during the workout (0–10 scale)"),
        rpe: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe("Rate of perceived exertion (1–10 scale)"),
        structure: z
          .string()
          .optional()
          .describe(
            "Replace the interval structure. Same JSON string format as the structure field in create_workout."
          ),
      },
    },
    async (params) => {
      const updates: Record<string, unknown> = {};
      if (params.sport !== undefined) updates.workoutTypeValueId = SportNameToId[params.sport];
      if (params.subtype_id !== undefined) updates.workoutSubTypeId = params.subtype_id;
      if (params.title !== undefined) updates.title = params.title;
      if (params.description !== undefined) updates.description = params.description;
      if (params.date !== undefined) updates.workoutDay = params.date;
      if (params.duration_hours !== undefined) updates.totalTimePlanned = params.duration_hours;
      if (params.tss !== undefined) updates.tssPlanned = params.tss;
      if (params.distance_planned !== undefined) updates.distancePlanned = params.distance_planned;
      if (params.tags !== undefined)
        updates.userTags = params.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .join(",");
      if (params.athlete_comment !== undefined) updates.athleteComments = params.athlete_comment;
      if (params.coach_comment !== undefined) updates.coachComments = params.coach_comment;
      if (params.feeling !== undefined) updates.feeling = params.feeling;
      if (params.rpe !== undefined) updates.rpe = params.rpe;
      if (params.structure !== undefined) updates.structure = resolveStructure(params.structure);
      const workout = await updateWorkout(params.workout_id, updates);
      return {
        content: [
          {
            type: "text" as const,
            text: `Workout updated successfully!\n\n${formatWorkoutSummary(workout)}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "delete_workout",
    {
      description: "Delete a workout",
      inputSchema: {
        workout_id: z.number().describe("The workout ID to delete"),
      },
    },
    async ({ workout_id }) => {
      await deleteWorkout(workout_id);
      return {
        content: [{ type: "text" as const, text: `Workout ${workout_id} deleted successfully.` }],
      };
    }
  );

  mcp.registerTool(
    "copy_workout",
    {
      description:
        "Copy an existing workout to a new date (duplicates the planned workout including structure, but not actual/completed data)",
      inputSchema: {
        workout_id: z.number().describe("The workout ID to copy"),
        target_date: z.string().describe("Target date in YYYY-MM-DD format"),
        title: z
          .string()
          .optional()
          .describe("Override the workout title (defaults to original title)"),
      },
    },
    async ({ workout_id, target_date, title }) => {
      const source = await getWorkout(workout_id);
      const structure = source.structure
        ? typeof source.structure === "string"
          ? source.structure
          : JSON.stringify(source.structure)
        : undefined;
      const workout = await createWorkout({
        workoutDay: target_date,
        workoutTypeValueId: source.workoutTypeValueId,
        workoutSubTypeId: source.workoutSubTypeId ?? undefined,
        title: title ?? source.title ?? "Untitled",
        description: source.description ?? undefined,
        coachComments: source.coachComments ?? undefined,
        totalTimePlanned: source.totalTimePlanned ?? undefined,
        distancePlanned: source.distancePlanned ?? undefined,
        tssPlanned: source.tssPlanned ?? undefined,
        structure,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Workout copied to ${target_date}.\n\n${formatWorkoutSummary(workout)}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "reorder_workouts",
    {
      description:
        "Reorder workouts on a given day. Pass workout IDs in the desired display order.",
      inputSchema: {
        workout_ids: z
          .array(z.number())
          .describe("Workout IDs in desired order (first = top of day)"),
      },
    },
    async ({ workout_ids }) => {
      const updates = workout_ids.map((id, i) => updateWorkout(id, { orderOnDay: i + 1 }));
      await Promise.all(updates);
      return {
        content: [
          {
            type: "text" as const,
            text: `Reordered ${workout_ids.length} workout(s): ${workout_ids.map((id, i) => `${id} → #${i + 1}`).join(", ")}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "get_workout_comments",
    {
      description: "Get comments on a workout (conversation thread between athlete and coach)",
      inputSchema: {
        workout_id: z.number().describe("The workout ID"),
      },
    },
    async ({ workout_id }) => {
      const comments = await getWorkoutComments(workout_id);
      if (comments.length === 0) {
        return { content: [{ type: "text" as const, text: "No comments on this workout." }] };
      }
      const text = comments
        .map(
          (c) => `[${c.dateCreated}] ${c.commenterName}${c.isCoach ? " (coach)" : ""}: ${c.comment}`
        )
        .join("\n");
      return {
        content: [{ type: "text" as const, text: `${comments.length} comment(s):\n\n${text}` }],
      };
    }
  );

  mcp.registerTool(
    "add_workout_comment",
    {
      description: "Add a comment to a workout (visible in the workout's comment thread)",
      inputSchema: {
        workout_id: z.number().describe("The workout ID to comment on"),
        comment: z.string().describe("The comment text"),
      },
    },
    async ({ workout_id, comment }) => {
      const comments = await addWorkoutComment(workout_id, comment);
      return {
        content: [
          {
            type: "text" as const,
            text: `Comment added. Thread now has ${comments.length} comment(s).`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "delete_workout_comment",
    {
      description: "Delete a comment from a workout's comment thread",
      inputSchema: {
        workout_id: z.number().describe("The workout ID"),
        comment_id: z.number().describe("The comment ID to delete (from get_workout_comments)"),
      },
    },
    async ({ workout_id, comment_id }) => {
      await deleteWorkoutComment(workout_id, comment_id);
      return {
        content: [{ type: "text" as const, text: `Comment ${comment_id} deleted.` }],
      };
    }
  );

  mcp.registerTool(
    "update_private_workout_note",
    {
      description:
        "Set or update the private note on a workout (only visible to the athlete, not the coach)",
      inputSchema: {
        workout_id: z.number().describe("The workout ID"),
        note: z.string().describe("The private note text"),
      },
    },
    async ({ workout_id, note }) => {
      await updatePrivateWorkoutNote(workout_id, note);
      return {
        content: [
          { type: "text" as const, text: `Private note updated on workout ${workout_id}.` },
        ],
      };
    }
  );

  mcp.registerTool(
    "validate_workout_structure",
    {
      description:
        "Validate a workout interval structure without creating a workout. Returns a summary on success or detailed error messages on failure.",
      inputSchema: {
        structure: z
          .string()
          .describe(
            "Structure JSON string to validate — same format as the structure field in create_workout"
          ),
      },
    },
    async ({ structure: raw }) => {
      try {
        const resolved = resolveStructure(raw);
        const parsed = JSON.parse(resolved) as WorkoutStructure;
        const blocks = parsed.structure;
        const totalSeconds = blocks.length > 0 ? blocks[blocks.length - 1].end : 0;
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
        const blockSummary = blocks
          .map((b) => {
            const name = b.steps[0]?.name ?? b.type;
            return b.type === "repetition" ? `${b.length.value}x ${name}` : name;
          })
          .join(", ");
        const lines = [
          "Structure is valid.",
          `Blocks: ${blocks.length} (${blockSummary})`,
          `Total duration: ${totalSeconds}s (${duration})`,
          `Intensity metric: ${parsed.primaryIntensityMetric}`,
        ];
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Structure validation failed:\n${msg}` }],
          isError: true,
        };
      }
    }
  );
}
