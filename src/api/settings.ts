import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, strengthApi } from "../api.js";
import { getAthleteId } from "../auth.js";

// Athlete settings / training zones from /fitness/v1/athletes/{id}/settings

export interface TrainingZone {
  label: string;
  minimum: number;
  maximum: number;
}

export interface HeartRateZoneSet {
  workoutTypeId: number; // 0=General, 2=Bike
  threshold: number; // bpm (0 if not configured)
  maximumHeartRate: number;
  restingHeartRate: number;
  zones: TrainingZone[];
  // Wire-format fields (present in GET response, required in PUT body)
  calculationMethod?: number;
  zoneCalculatorId?: number | null;
  currentUserId?: number;
}

export interface PowerZoneSet {
  workoutTypeId: number; // 0=Bike
  threshold: number; // watts (FTP)
  zones: TrainingZone[];
  // Wire-format fields
  calculationMethod?: number;
  distance?: number;
  zoneCalculatorId?: number | null;
  currentUserId?: number;
}

export interface SpeedZoneSet {
  workoutTypeId: number; // 0=Run, 1=Swim, 2=Bike
  threshold: number; // m/s (0 if not configured)
  zones: TrainingZone[];
  // Wire-format fields
  calculationMethod?: number;
  distance?: number;
  zoneCalculatorId?: number | null;
  currentUserId?: number;
}

export interface AthleteSettings {
  athleteId: number;
  heartRateZones: HeartRateZoneSet[];
  powerZones: PowerZoneSet[];
  speedZones: SpeedZoneSet[];
  firstName?: string;
  lastName?: string;
  timeZone?: string;
  units?: number; // 1=imperial, 2=metric
  age?: number;
  gender?: string;
  birthday?: string;
  nutritionSettings?: { plannedCalories?: number; substrateUtilizationCategory?: number };
}

// ─── Pool length settings from /fitness/v1/athletes/{id}/poollengthsettings ──

export interface PoolLengthOption {
  id: string; // e.g. "DEFAULT-50M" or a UUID for custom pools
  length: number;
  units: "Meters" | "Yards";
  label: string | null;
}

export interface PoolLengthSettings {
  options: PoolLengthOption[];
  defaultId: string;
  supportedUnits: string[];
}

// ─── Weather settings from api.peakswaresb.com/weather/v1/settings ───────────

export interface WeatherSettings {
  athleteId: string;
  enabled: number; // 1=enabled, 0=disabled
  location: string;
  lat: string;
  lon: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getAthleteSettings(): Promise<AthleteSettings> {
  const athleteId = await getAthleteId();
  return api<AthleteSettings>({
    method: "get",
    path: `/fitness/v1/athletes/${athleteId}/settings`,
  });
}

// Coggan 5-zone power model — percentages confirmed from devtools capture (FTP=320).
function recalcPowerZones(zoneSet: PowerZoneSet, newFtp: number): PowerZoneSet {
  const r = (pct: number) => Math.round((pct / 100) * newFtp);
  return {
    ...zoneSet,
    threshold: newFtp,
    zones: [
      { label: "Zone 1", minimum: 0, maximum: r(55) },
      { label: "Zone 2", minimum: r(55) + 1, maximum: r(75) },
      { label: "Zone 3", minimum: r(75) + 1, maximum: r(90) },
      { label: "Zone 4", minimum: r(90) + 1, maximum: r(105) },
      { label: "Zone 5", minimum: r(105) + 1, maximum: 2000 },
    ],
  };
}

// Scale HR zone boundaries proportionally when threshold changes.
function scaleHrZoneSet(
  zoneSet: HeartRateZoneSet,
  params: { threshold?: number; maxHr?: number; restingHr?: number }
): HeartRateZoneSet {
  const newThreshold = params.threshold ?? zoneSet.threshold;
  const newMaxHr = params.maxHr ?? zoneSet.maximumHeartRate;
  const newRestingHr = params.restingHr ?? zoneSet.restingHeartRate;

  let zones = zoneSet.zones;
  if (params.threshold !== undefined && zoneSet.threshold > 0) {
    const ratio = newThreshold / zoneSet.threshold;
    zones = zoneSet.zones.map((z, i) => ({
      label: z.label,
      minimum: Math.round(z.minimum * ratio),
      maximum: i === zoneSet.zones.length - 1 ? newMaxHr : Math.round(z.maximum * ratio),
    }));
  } else if (params.maxHr !== undefined) {
    zones = zoneSet.zones.map((z, i) => ({
      ...z,
      maximum: i === zoneSet.zones.length - 1 ? newMaxHr : z.maximum,
    }));
  }

  return {
    ...zoneSet,
    threshold: newThreshold,
    maximumHeartRate: newMaxHr,
    restingHeartRate: newRestingHr,
    zones,
  };
}

// Scale speed zone boundaries proportionally. Sentinel max = 10× new threshold.
function scaleSpeedZoneSet(zoneSet: SpeedZoneSet, newThresholdMs: number): SpeedZoneSet {
  if (zoneSet.threshold <= 0) return { ...zoneSet, threshold: newThresholdMs };
  const ratio = newThresholdMs / zoneSet.threshold;
  return {
    ...zoneSet,
    threshold: newThresholdMs,
    zones: zoneSet.zones.map((z, i) => ({
      label: z.label,
      minimum: z.minimum * ratio,
      maximum: i === zoneSet.zones.length - 1 ? newThresholdMs * 10 : z.maximum * ratio,
    })),
  };
}

export async function updateFtp(newFtp: number): Promise<PowerZoneSet[]> {
  const [settings, athleteId] = await Promise.all([getAthleteSettings(), getAthleteId()]);
  const updatedZones = settings.powerZones.map((z) =>
    z.workoutTypeId === 0 ? recalcPowerZones({ ...z, currentUserId: athleteId }, newFtp) : z
  );
  await api<unknown>({
    method: "put",
    path: `/fitness/v2/athletes/${athleteId}/powerzones`,
    data: updatedZones,
  });
  return updatedZones;
}

export async function updateHrZones(
  workoutTypeId: number,
  params: { threshold?: number; maxHr?: number; restingHr?: number }
): Promise<HeartRateZoneSet[]> {
  const [settings, athleteId] = await Promise.all([getAthleteSettings(), getAthleteId()]);
  const updatedZones = settings.heartRateZones.map((z) =>
    z.workoutTypeId === workoutTypeId
      ? scaleHrZoneSet({ ...z, currentUserId: athleteId }, params)
      : { ...z, currentUserId: athleteId }
  );
  await api<unknown>({
    method: "put",
    path: `/fitness/v2/athletes/${athleteId}/heartratezones`,
    data: updatedZones,
  });
  return updatedZones;
}

export async function updateSpeedZones(params: {
  runThresholdMs?: number;
  swimThresholdMs?: number;
}): Promise<SpeedZoneSet[]> {
  const [settings, athleteId] = await Promise.all([getAthleteSettings(), getAthleteId()]);
  const updatedZones = settings.speedZones.map((z) => {
    const base = { ...z, currentUserId: athleteId };
    if (z.workoutTypeId === 0 && params.runThresholdMs !== undefined) {
      return scaleSpeedZoneSet(base, params.runThresholdMs);
    }
    if (z.workoutTypeId === 1 && params.swimThresholdMs !== undefined) {
      return scaleSpeedZoneSet(base, params.swimThresholdMs);
    }
    return base;
  });
  await api<unknown>({
    method: "put",
    path: `/fitness/v2/athletes/${athleteId}/speedzones`,
    data: updatedZones,
  });
  return updatedZones;
}

export async function getWeatherSettings(): Promise<WeatherSettings[]> {
  return strengthApi<WeatherSettings[]>({
    method: "get",
    path: "/weather/v1/settings",
  });
}

export async function getPoolLengthSettings(): Promise<PoolLengthSettings> {
  const athleteId = await getAthleteId();
  return api<PoolLengthSettings>({
    method: "get",
    path: `/fitness/v1/athletes/${athleteId}/poollengthsettings`,
  });
}

export async function updateNutritionSettings(plannedCalories: number): Promise<void> {
  const [settings, athleteId] = await Promise.all([getAthleteSettings(), getAthleteId()]);
  await api<unknown>({
    method: "post",
    path: `/fitness/v1/athletes/${athleteId}/nutritionsettings`,
    data: {
      athleteId,
      plannedCalories,
      substrateUtilizationCategory: settings.nutritionSettings?.substrateUtilizationCategory ?? 4,
    },
  });
}

// ─── Display utilities ────────────────────────────────────────────────────────

const SENTINEL_SPEED = 30;
const SENTINEL_POWER = 1500;
const SENTINEL_HR = 250;

function msToMinPerKm(ms: number): string {
  if (ms <= 0) return "—";
  const secPerKm = 1000 / ms;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function msToMinPer100m(ms: number): string {
  if (ms <= 0) return "—";
  const secPer100m = 100 / ms;
  const min = Math.floor(secPer100m / 60);
  const sec = Math.round(secPer100m % 60);
  return `${min}:${String(sec).padStart(2, "0")}/100m`;
}

function msToKmh(ms: number): string {
  if (ms <= 0) return "—";
  return `${(ms * 3.6).toFixed(1)} km/h`;
}

function formatAthleteSettings(s: AthleteSettings): string {
  const lines: string[] = [];

  lines.push("## Thresholds");
  const pwrSet = s.powerZones?.find((z) => z.workoutTypeId === 0);
  if (pwrSet && pwrSet.threshold > 0) lines.push(`FTP: ${pwrSet.threshold} W`);

  const hrSet = s.heartRateZones?.find((z) => z.workoutTypeId === 0);
  if (hrSet && hrSet.threshold > 0) lines.push(`Threshold HR: ${hrSet.threshold} bpm`);
  if (hrSet && hrSet.maximumHeartRate > 0) lines.push(`Max HR: ${hrSet.maximumHeartRate} bpm`);
  if (hrSet && hrSet.restingHeartRate > 0) lines.push(`Resting HR: ${hrSet.restingHeartRate} bpm`);

  const runSpeedSet = s.speedZones?.find((z) => z.workoutTypeId === 0);
  if (runSpeedSet && runSpeedSet.threshold > 0)
    lines.push(`Run threshold pace: ${msToMinPerKm(runSpeedSet.threshold)}`);

  const swimSpeedSet = s.speedZones?.find((z) => z.workoutTypeId === 1);
  if (swimSpeedSet && swimSpeedSet.threshold > 0)
    lines.push(`Swim threshold pace: ${msToMinPer100m(swimSpeedSet.threshold)}`);

  if (pwrSet && pwrSet.zones?.length > 0) {
    lines.push("\n## Power Zones (% FTP / watts)");
    for (const z of pwrSet.zones) {
      const minW =
        pwrSet.threshold > 0 ? ` (${Math.round((z.minimum * pwrSet.threshold) / 100)}W` : "";
      const maxPart =
        z.maximum >= SENTINEL_POWER
          ? `> ${z.minimum}%${minW ? minW + "+" : ""}`
          : `${z.minimum}–${z.maximum}%${minW ? minW + `–${Math.round((z.maximum * pwrSet.threshold) / 100)}W)` : ""}`;
      lines.push(`  ${z.label}: ${maxPart}`);
    }
  }

  if (hrSet && hrSet.zones?.length > 0) {
    lines.push("\n## Heart Rate Zones (bpm)");
    for (const z of hrSet.zones) {
      const maxPart =
        z.maximum >= SENTINEL_HR ? `> ${z.minimum} bpm` : `${z.minimum}–${z.maximum} bpm`;
      lines.push(`  ${z.label}: ${maxPart}`);
    }
  }

  if (runSpeedSet && runSpeedSet.zones?.length > 0) {
    lines.push("\n## Run Pace Zones (min/km)");
    for (const z of runSpeedSet.zones) {
      const slowPace = msToMinPerKm(z.minimum);
      const fastPace = z.maximum >= SENTINEL_SPEED ? "faster" : msToMinPerKm(z.maximum);
      const range = z.maximum >= SENTINEL_SPEED ? `< ${slowPace}` : `${fastPace}–${slowPace}`;
      lines.push(`  ${z.label}: ${range}`);
    }
  }

  if (swimSpeedSet && swimSpeedSet.zones?.length > 0) {
    lines.push("\n## Swim Pace Zones (min/100m)");
    for (const z of swimSpeedSet.zones) {
      const slowPace = msToMinPer100m(z.minimum);
      const fastPace = z.maximum >= SENTINEL_SPEED ? "faster" : msToMinPer100m(z.maximum);
      const range = z.maximum >= SENTINEL_SPEED ? `< ${slowPace}` : `${fastPace}–${slowPace}`;
      lines.push(`  ${z.label}: ${range}`);
    }
  }

  const bikeSpeedSet = s.speedZones?.find((z) => z.workoutTypeId === 2);
  if (bikeSpeedSet && bikeSpeedSet.zones?.length > 0 && bikeSpeedSet.threshold > 0) {
    lines.push("\n## Bike Speed Zones (km/h)");
    for (const z of bikeSpeedSet.zones) {
      const minKmh = msToKmh(z.minimum);
      const maxPart =
        z.maximum >= SENTINEL_SPEED ? `> ${minKmh}` : `${minKmh}–${msToKmh(z.maximum)}`;
      lines.push(`  ${z.label}: ${maxPart}`);
    }
  }

  const profileParts: string[] = [];
  if (s.timeZone) profileParts.push(`Timezone: ${s.timeZone}`);
  if (s.units !== undefined) profileParts.push(`Units: ${s.units === 1 ? "imperial" : "metric"}`);
  if (s.age) profileParts.push(`Age: ${s.age}`);
  if (s.gender) profileParts.push(`Gender: ${s.gender}`);
  if (profileParts.length > 0) lines.push(`\n## Profile\n${profileParts.join("\n")}`);

  if (s.nutritionSettings?.plannedCalories) {
    lines.push(`\n## Nutrition\nPlanned daily calories: ${s.nutritionSettings.plannedCalories}`);
  }

  return lines.join("\n");
}

// Parse "M:SS" or "MM:SS" (with optional "/km" or "/100m" suffix) → m/s
function parsePaceToMs(pace: string, per: "km" | "100m"): number {
  const cleaned = pace.replace(/\/(km|100m)$/i, "").trim();
  const parts = cleaned.split(":");
  if (parts.length !== 2) throw new Error(`Invalid pace "${pace}". Use M:SS format.`);
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  if (isNaN(minutes) || isNaN(seconds) || seconds >= 60)
    throw new Error(`Invalid pace "${pace}". Use M:SS format.`);
  const totalSeconds = minutes * 60 + seconds;
  if (totalSeconds <= 0) throw new Error("Pace must be positive.");
  return per === "km" ? 1000 / totalSeconds : 100 / totalSeconds;
}

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerSettingsTools(mcp: McpServer): void {
  mcp.registerTool(
    "get_athlete_settings",
    {
      description:
        "Get athlete training zones and thresholds: FTP, threshold HR, run/swim threshold pace, and all power/HR/run/swim pace zones",
    },
    async () => {
      const settings = await getAthleteSettings();
      return { content: [{ type: "text" as const, text: formatAthleteSettings(settings) }] };
    }
  );

  mcp.registerTool(
    "update_ftp",
    {
      description:
        "Update FTP (Functional Threshold Power) and automatically recalculate all 5 Coggan power zones",
      inputSchema: {
        ftp: z.number().describe("New FTP value in watts"),
      },
    },
    async ({ ftp }) => {
      const updatedZones = await updateFtp(ftp);
      const zs = updatedZones.find((s) => s.workoutTypeId === 0)!;
      const rows = zs.zones.map(
        (zone) => `  ${zone.label}: ${zone.minimum}–${zone.maximum === 2000 ? "∞" : zone.maximum} W`
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `FTP updated to ${ftp} W.\n\nNew power zones:\n${rows.join("\n")}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "update_hr_zones",
    {
      description:
        "Update heart rate thresholds (threshold HR, max HR, resting HR) and recalculate HR zones proportionally",
      inputSchema: {
        threshold_hr: z.number().optional().describe("Threshold (lactate) HR in bpm"),
        max_hr: z.number().optional().describe("Maximum HR in bpm"),
        resting_hr: z.number().optional().describe("Resting HR in bpm"),
        workout_type: z
          .enum(["general", "bike"])
          .optional()
          .default("general")
          .describe("Which zone set to update: general (default) or bike"),
      },
    },
    async ({ threshold_hr, max_hr, resting_hr, workout_type }) => {
      if (threshold_hr === undefined && max_hr === undefined && resting_hr === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide at least one of: threshold_hr, max_hr, resting_hr.",
            },
          ],
          isError: true,
        };
      }
      const workoutTypeId = workout_type === "bike" ? 2 : 0;
      const updatedZones = await updateHrZones(workoutTypeId, {
        threshold: threshold_hr,
        maxHr: max_hr,
        restingHr: resting_hr,
      });
      const zs = updatedZones.find((s) => s.workoutTypeId === workoutTypeId)!;
      const label = workout_type === "bike" ? "Bike" : "General";
      const rows = zs.zones.map(
        (zone) => `  ${zone.label}: ${zone.minimum}–${zone.maximum >= 250 ? "∞" : zone.maximum} bpm`
      );
      const summary = [
        `HR zones (${label}) updated.`,
        zs.threshold > 0 ? `Threshold HR: ${zs.threshold} bpm` : "",
        `Max HR: ${zs.maximumHeartRate} bpm`,
        zs.restingHeartRate > 0 ? `Resting HR: ${zs.restingHeartRate} bpm` : "",
        `\nNew zones:\n${rows.join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n");
      return { content: [{ type: "text" as const, text: summary }] };
    }
  );

  mcp.registerTool(
    "update_speed_zones",
    {
      description:
        "Update run and/or swim threshold pace and recalculate pace zones proportionally",
      inputSchema: {
        run_threshold_pace: z
          .string()
          .optional()
          .describe("Run threshold pace in M:SS/km format (e.g. '4:30/km' or '4:30')"),
        swim_threshold_pace: z
          .string()
          .optional()
          .describe("Swim threshold pace in M:SS/100m format (e.g. '1:45/100m' or '1:45')"),
      },
    },
    async ({ run_threshold_pace, swim_threshold_pace }) => {
      if (run_threshold_pace === undefined && swim_threshold_pace === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide at least one of: run_threshold_pace, swim_threshold_pace.",
            },
          ],
          isError: true,
        };
      }
      const runMs = run_threshold_pace ? parsePaceToMs(run_threshold_pace, "km") : undefined;
      const swimMs = swim_threshold_pace ? parsePaceToMs(swim_threshold_pace, "100m") : undefined;
      const updatedZones = await updateSpeedZones({
        runThresholdMs: runMs,
        swimThresholdMs: swimMs,
      });

      const lines: string[] = [];
      if (runMs !== undefined) {
        const zs = updatedZones.find((s) => s.workoutTypeId === 0)!;
        lines.push(`Run threshold pace updated to ${run_threshold_pace}.`);
        lines.push("New run pace zones:");
        for (const zone of zs.zones) {
          const slow = msToMinPerKm(zone.minimum);
          const fast = zone.maximum >= SENTINEL_SPEED ? "faster" : msToMinPerKm(zone.maximum);
          lines.push(
            `  ${zone.label}: ${zone.maximum >= SENTINEL_SPEED ? `< ${slow}` : `${fast}–${slow}`}`
          );
        }
      }
      if (swimMs !== undefined) {
        const zs = updatedZones.find((s) => s.workoutTypeId === 1)!;
        if (lines.length > 0) lines.push("");
        lines.push(`Swim threshold pace updated to ${swim_threshold_pace}.`);
        lines.push("New swim pace zones:");
        for (const zone of zs.zones) {
          const slow = msToMinPer100m(zone.minimum);
          const fast = zone.maximum >= SENTINEL_SPEED ? "faster" : msToMinPer100m(zone.maximum);
          lines.push(
            `  ${zone.label}: ${zone.maximum >= SENTINEL_SPEED ? `< ${slow}` : `${fast}–${slow}`}`
          );
        }
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "get_weather_settings",
    { description: "Get weather display settings (location, coordinates, enabled status)" },
    async () => {
      const entries = await getWeatherSettings();
      if (entries.length === 0) {
        return { content: [{ type: "text" as const, text: "No weather settings configured." }] };
      }
      const s = entries[0];
      const lines = [
        `Weather: ${s.enabled ? "enabled" : "disabled"}`,
        `Location: ${s.location}`,
        `Coordinates: ${s.lat}, ${s.lon}`,
      ];
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "get_pool_length_settings",
    {
      description:
        "Get available pool length options and the current default pool length for swim workouts",
    },
    async () => {
      const pool = await getPoolLengthSettings();
      const lines: string[] = ["Pool length options:"];
      for (const opt of pool.options) {
        const isDefault = opt.id === pool.defaultId;
        const label = opt.label ?? `${opt.length} ${opt.units}`;
        lines.push(`  ${isDefault ? "* " : "  "}${label} (id: ${opt.id})`);
      }
      lines.push(`\nDefault: ${pool.defaultId}`);
      lines.push(`Supported units: ${pool.supportedUnits.join(", ")}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "update_nutrition",
    {
      description: "Update planned daily calorie intake",
      inputSchema: {
        planned_calories: z.number().describe("Planned daily calorie intake"),
      },
    },
    async ({ planned_calories }) => {
      await updateNutritionSettings(planned_calories);
      return {
        content: [
          {
            type: "text" as const,
            text: `Planned daily calories updated to ${planned_calories} kcal.`,
          },
        ],
      };
    }
  );
}
