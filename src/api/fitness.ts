import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "../api.js";
import { getAthleteId } from "../auth.js";

export interface FitnessMetric {
  workoutDay: string;
  tssActual: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface PersonalRecord {
  rank: number;
  value: number;
  workoutId: number;
  workoutTitle: string;
  workoutDate: string;
}

export interface WorkoutPR {
  type: string;
  value: number;
  rank: number;
}

// ─── Annual Training Plan from GET /fitness/v1/athletes/{id}/atp/{start}/{end} ─

export interface ATPWeek {
  athlete: number;
  week: string; // ISO datetime (start of week)
  atpType: string; // "TSS"
  volume: number; // planned weekly TSS
  period: string; // e.g. "Base 1 - Week 2", "Race"
  raceName: string;
  racePriority: "A" | "B" | "C" | "";
  limitingFactors: Record<string, string[]>; // keyed "1","2","3" by sport
  weeksToNextPriorityEvent: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getFitnessMetrics(
  startDate: string,
  endDate: string
): Promise<FitnessMetric[]> {
  const athleteId = await getAthleteId();
  return api<FitnessMetric[]>({
    method: "post",
    path: `/fitness/v1/athletes/${athleteId}/reporting/performancedata/${startDate}/${endDate}`,
    data: { atlConstant: 7, atlStart: 0, ctlConstant: 42, ctlStart: 0, workoutTypes: [] },
  });
}

export async function getWorkoutPRs(workoutId: number): Promise<PersonalRecord[]> {
  const athleteId = await getAthleteId();
  return api<PersonalRecord[]>({
    method: "get",
    path: `/personalrecord/v2/athletes/${athleteId}/workouts/${workoutId}?displayPeaksForBasic=true`,
  });
}

export async function getATP(startDate: string, endDate: string): Promise<ATPWeek[]> {
  const athleteId = await getAthleteId();
  return api<ATPWeek[]>({
    method: "get",
    path: `/fitness/v1/athletes/${athleteId}/atp/${startDate}/${endDate}`,
  });
}

export async function getPeaks(
  sport: "Bike" | "Run",
  metric: string,
  startDate?: string,
  endDate?: string
): Promise<PersonalRecord[]> {
  const athleteId = await getAthleteId();
  const params = new URLSearchParams({ prType: metric });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  return api<PersonalRecord[]>({
    method: "get",
    path: `/personalrecord/v2/athletes/${athleteId}/${sport}?${params.toString()}`,
  });
}

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerFitnessTools(mcp: McpServer): void {
  mcp.registerTool(
    "get_atp",
    {
      description:
        "Get the Annual Training Plan (ATP): weekly TSS volume targets, training periods, and scheduled races for a date range",
      inputSchema: {
        start_date: z.string().describe("Start date YYYY-MM-DD"),
        end_date: z.string().describe("End date YYYY-MM-DD"),
      },
    },
    async ({ start_date, end_date }) => {
      const weeks = await getATP(start_date, end_date);
      if (weeks.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No ATP data found for the specified range." }],
        };
      }
      const lines: string[] = ["Week        Period                        TSS   Race"];
      lines.push("─".repeat(70));
      for (const w of weeks) {
        const date = w.week.slice(0, 10);
        const period = w.period.padEnd(30);
        const tss = String(w.volume).padStart(4);
        const race = w.raceName
          ? ` ${w.racePriority ? `[${w.racePriority}] ` : ""}${w.raceName}`
          : "";
        lines.push(`${date}  ${period}  ${tss}${race}`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "get_fitness_metrics",
    {
      description: "Get daily CTL (fitness), ATL (fatigue), and TSB (form) data for a date range",
      inputSchema: {
        start_date: z.string().describe("Start date YYYY-MM-DD"),
        end_date: z.string().describe("End date YYYY-MM-DD"),
      },
    },
    async ({ start_date, end_date }) => {
      const metrics = await getFitnessMetrics(start_date, end_date);
      if (metrics.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No fitness metrics found for the specified range." },
          ],
        };
      }
      const rows = metrics.map(
        (m) =>
          `${m.workoutDay}  CTL: ${m.ctl.toFixed(1).padStart(5)}  ATL: ${m.atl.toFixed(1).padStart(5)}  TSB: ${m.tsb.toFixed(1).padStart(6)}  TSS: ${String(m.tssActual ?? 0).padStart(4)}`
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Date        CTL    ATL     TSB   TSS\n${"─".repeat(50)}\n${rows.join("\n")}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "get_workout_prs",
    {
      description: "Get personal records set during a specific workout",
      inputSchema: {
        workout_id: z.number().describe("The workout ID to fetch PRs for"),
      },
    },
    async ({ workout_id }) => {
      const prs = await getWorkoutPRs(workout_id);
      if (!prs || prs.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No personal records set during this workout." },
          ],
        };
      }
      const text = prs
        .map((pr) => `Rank #${pr.rank}: ${pr.value} (${pr.workoutTitle} on ${pr.workoutDate})`)
        .join("\n");
      return {
        content: [
          { type: "text" as const, text: `PRs set during workout ${workout_id}:\n${text}` },
        ],
      };
    }
  );

  mcp.registerTool(
    "get_peaks",
    {
      description: "Get all-time or period power/speed bests for cycling or running",
      inputSchema: {
        sport: z.enum(["bike", "run"]).describe("Sport type"),
        metric: z
          .string()
          .describe(
            "Metric type. Bike: power5sec, power1min, power5min, power10min, power20min, power60min, power90min. " +
              "Run: speed400Meter, speed800Meter, speed1K, speed1Mi, speed5K, speed10K, speedHalfMarathon, speedMarathon"
          ),
        start_date: z.string().optional().describe("Filter from this date (YYYY-MM-DD)"),
        end_date: z.string().optional().describe("Filter to this date (YYYY-MM-DD)"),
      },
    },
    async ({ sport, metric, start_date, end_date }) => {
      const sportParam = sport === "bike" ? "Bike" : "Run";
      const peaks = await getPeaks(sportParam, metric, start_date, end_date);
      if (!peaks || peaks.length === 0) {
        return { content: [{ type: "text" as const, text: `No peaks found for ${metric}.` }] };
      }
      const text = peaks
        .slice(0, 10)
        .map((p) => `#${p.rank}: ${p.value} — ${p.workoutTitle} (${p.workoutDate})`)
        .join("\n");
      return {
        content: [{ type: "text" as const, text: `Top peaks for ${sport} ${metric}:\n${text}` }],
      };
    }
  );
}
