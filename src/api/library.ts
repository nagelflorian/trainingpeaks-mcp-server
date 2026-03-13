import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "../api.js";
import { getAthleteId } from "../auth.js";
import {
  SportNameToId,
  resolveStructure,
  formatWorkoutSummary,
  formatDuration,
  sportIdToName,
} from "./workouts.js";
import type { Workout } from "./workouts.js";

// Exercise library types from /exerciselibrary/v2/...

export interface ExerciseLibrary {
  exerciseLibraryId: number;
  libraryName: string;
  ownerId: number;
  ownerName: string;
  imageUrl: string;
  isDefaultContent: boolean;
}

export interface ExerciseLibraryItem {
  exerciseLibraryId: number;
  exerciseLibraryItemId: number;
  exerciseLibraryItemType: string; // "WorkoutTemplate"
  itemName: string;
  workoutTypeId: number;
  totalTimePlanned?: number | null; // hours
  tssPlanned?: number | null;
  ifPlanned?: number | null;
  distancePlanned?: number | null;
  velocityPlanned?: number | null;
  energyPlanned?: number | null;
  elevationGainPlanned?: number | null;
  caloriesPlanned?: number | null;
  description?: string | null;
  coachComments?: string | null;
  // structure is a nested object in GET responses (not a double-serialized string)
  structure?: Record<string, unknown> | null;
  fromLegacy?: boolean;
  workoutSubTypeId?: number | null;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getLibraries(): Promise<ExerciseLibrary[]> {
  return api<ExerciseLibrary[]>({ method: "get", path: "/exerciselibrary/v2/libraries" });
}

export async function getLibraryItems(libraryId: number): Promise<ExerciseLibraryItem[]> {
  return api<ExerciseLibraryItem[]>({
    method: "get",
    path: `/exerciselibrary/v2/libraries/${libraryId}/items`,
  });
}

export async function createLibrary(name: string): Promise<ExerciseLibrary> {
  return api<ExerciseLibrary>({
    method: "post",
    path: "/exerciselibrary/v1/libraries",
    data: { libraryName: name },
  });
}

// structure must be a plain nested object (NOT a double-serialized string).
export async function createLibraryItem(
  libraryId: number,
  item: {
    workoutTypeId: number;
    itemName: string;
    tssPlanned?: number | null;
    ifPlanned?: number | null;
    totalTimePlanned?: number | null;
    description?: string | null;
    structure?: Record<string, unknown>;
  }
): Promise<ExerciseLibraryItem> {
  return api<ExerciseLibraryItem>({
    method: "post",
    path: `/exerciselibrary/v1/libraries/${libraryId}/items`,
    data: {
      exerciseId: null,
      exerciseLibraryId: libraryId,
      distancePlanned: null,
      velocityPlanned: null,
      energyPlanned: null,
      exerciseLibraryItemType: "WorkoutTemplate",
      ...item,
    },
  });
}

export async function moveLibraryItem(
  fromLibraryId: number,
  itemId: number,
  toLibraryId: number
): Promise<ExerciseLibraryItem> {
  // GET the item, update exerciseLibraryId, PUT to the source library endpoint
  const items = await getLibraryItems(fromLibraryId);
  const item = items.find((i) => i.exerciseLibraryItemId === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in library ${fromLibraryId}`);
  return api<ExerciseLibraryItem>({
    method: "put",
    path: `/exerciselibrary/v1/libraries/${fromLibraryId}/items/${itemId}`,
    data: { ...item, exerciseLibraryId: toLibraryId },
  });
}

export async function renameLibrary(libraryId: number, name: string): Promise<ExerciseLibrary> {
  return api<ExerciseLibrary>({
    method: "put",
    path: `/exerciselibrary/v1/libraries/${libraryId}/name`,
    data: { value: name },
  });
}

export async function updateLibraryItem(
  libraryId: number,
  itemId: number,
  updates: Partial<ExerciseLibraryItem>
): Promise<ExerciseLibraryItem> {
  const items = await getLibraryItems(libraryId);
  const item = items.find((i) => i.exerciseLibraryItemId === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in library ${libraryId}`);
  return api<ExerciseLibraryItem>({
    method: "put",
    path: `/exerciselibrary/v1/libraries/${libraryId}/items/${itemId}`,
    data: { ...item, ...updates },
  });
}

export async function deleteLibraryItem(libraryId: number, itemId: number): Promise<void> {
  await api<void>({
    method: "delete",
    path: `/exerciselibrary/v1/libraries/${libraryId}/items/${itemId}`,
  });
}

export async function deleteLibrary(libraryId: number): Promise<void> {
  await api<unknown>({ method: "delete", path: `/exerciselibrary/v1/libraries/${libraryId}` });
}

// ─── Display utilities ────────────────────────────────────────────────────────

function formatLibraryItem(item: {
  exerciseLibraryItemId: number;
  itemName: string;
  workoutTypeId?: number;
  totalTimePlanned?: number | null;
  tssPlanned?: number | null;
  ifPlanned?: number | null;
  description?: string | null;
}): string {
  const parts = [
    `ID: ${item.exerciseLibraryItemId}  [${sportIdToName(item.workoutTypeId ?? 0)}] ${item.itemName}`,
  ];
  const meta: string[] = [];
  if (item.totalTimePlanned) meta.push(`Duration: ${formatDuration(item.totalTimePlanned)}`);
  if (item.tssPlanned != null) meta.push(`TSS: ${item.tssPlanned.toFixed(0)}`);
  if (item.ifPlanned != null) meta.push(`IF: ${item.ifPlanned.toFixed(2)}`);
  if (meta.length) parts.push(meta.join("  "));
  if (item.description)
    parts.push(item.description.slice(0, 120) + (item.description.length > 120 ? "…" : ""));
  return parts.join("\n");
}

// ─── Tool registration ───────────────────────────────────────────────────────

const LIBRARY_SPORT_ENUM = [
  "swim",
  "bike",
  "run",
  "brick",
  "crosstrain",
  "note",
  "mtb",
  "weights",
  "custom",
  "walk",
  "ski",
  "rowing",
  "other",
] as const;

export function registerLibraryTools(mcp: McpServer): void {
  mcp.registerTool(
    "get_libraries",
    {
      description:
        "List all exercise libraries (workout template folders), both personal and TrainingPeaks default libraries",
    },
    async () => {
      const libraries = await getLibraries();
      const personal = libraries.filter((l) => !l.isDefaultContent);
      const defaults = libraries.filter((l) => l.isDefaultContent);
      const lines: string[] = [];
      if (personal.length > 0) {
        lines.push("## Your Libraries");
        for (const l of personal) lines.push(`  ID: ${l.exerciseLibraryId}  ${l.libraryName}`);
      }
      if (defaults.length > 0) {
        lines.push("## TrainingPeaks Default Libraries");
        for (const l of defaults)
          lines.push(`  ID: ${l.exerciseLibraryId}  ${l.libraryName} (${l.ownerName})`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "get_library_items",
    {
      description: "List workout templates in an exercise library",
      inputSchema: {
        library_id: z.number().describe("Library ID (from get_libraries)"),
      },
    },
    async ({ library_id }) => {
      const items = await getLibraryItems(library_id);
      if (items.length === 0) {
        return { content: [{ type: "text" as const, text: "No items in this library." }] };
      }
      const text = items.map(formatLibraryItem).join("\n\n---\n\n");
      return {
        content: [{ type: "text" as const, text: `${items.length} template(s):\n\n${text}` }],
      };
    }
  );

  mcp.registerTool(
    "get_library_item",
    {
      description:
        "Get full details of a single library workout template, including interval structure",
      inputSchema: {
        library_id: z.number().describe("Library ID containing the item"),
        item_id: z.number().describe("Exercise library item ID (from get_library_items)"),
      },
    },
    async ({ library_id, item_id }) => {
      const items = await getLibraryItems(library_id);
      const item = items.find((i) => i.exerciseLibraryItemId === item_id);
      if (!item) {
        return {
          content: [
            { type: "text" as const, text: `Item ${item_id} not found in library ${library_id}.` },
          ],
          isError: true,
        };
      }
      const lines = [formatLibraryItem(item)];
      if (item.description) lines.push(`\nDescription:\n${item.description}`);
      if (item.coachComments) lines.push(`\nCoach comments:\n${item.coachComments}`);
      if (item.structure) {
        lines.push(`\nInterval Structure:\n${JSON.stringify(item.structure, null, 2)}`);
      }
      return { content: [{ type: "text" as const, text: lines.join("") }] };
    }
  );

  mcp.registerTool(
    "create_library",
    {
      description: "Create a new exercise library folder",
      inputSchema: {
        name: z.string().describe("Name for the new library folder"),
      },
    },
    async ({ name }) => {
      const library = await createLibrary(name);
      return {
        content: [
          {
            type: "text" as const,
            text: `Library created: "${library.libraryName}" (ID: ${library.exerciseLibraryId})`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "create_library_item",
    {
      description: "Save a workout as a reusable template in an exercise library",
      inputSchema: {
        library_id: z.number().describe("Library ID to save into"),
        name: z.string().describe("Template name"),
        sport: z
          .enum(LIBRARY_SPORT_ENUM)
          .describe("Sport type. Use 'note' for a Day Off or rest day."),
        duration_hours: z.number().optional().describe("Planned duration in hours"),
        tss: z.number().optional().describe("Planned TSS"),
        if_value: z.number().optional().describe("Planned Intensity Factor (0.0–1.2)"),
        description: z.string().optional().describe("Workout description / notes"),
        structure: z
          .string()
          .optional()
          .describe("Interval structure JSON string (same format as create_workout)"),
      },
    },
    async (params) => {
      // Structure is a nested object in library items (not double-serialized).
      const structureObj = params.structure
        ? (JSON.parse(resolveStructure(params.structure)) as Record<string, unknown>)
        : undefined;
      const item = await createLibraryItem(params.library_id, {
        workoutTypeId: SportNameToId[params.sport],
        itemName: params.name,
        totalTimePlanned: params.duration_hours ?? null,
        tssPlanned: params.tss ?? null,
        ifPlanned: params.if_value ?? null,
        description: params.description ?? null,
        structure: structureObj,
      });
      return {
        content: [
          { type: "text" as const, text: `Workout template saved.\n\n${formatLibraryItem(item)}` },
        ],
      };
    }
  );

  mcp.registerTool(
    "schedule_library_workout",
    {
      description: "Schedule a library workout template as a planned workout on a specific date",
      inputSchema: {
        item_id: z.number().describe("Exercise library item ID (from get_library_items)"),
        date: z.string().describe("Target date in YYYY-MM-DD format"),
      },
    },
    async ({ item_id, date }) => {
      const athleteId = await getAthleteId();
      // Use the dedicated TP endpoint — the server computes duration, TSS, IF, etc.
      const workout = await api<Workout>({
        method: "post",
        path: `/fitness/v6/athletes/${athleteId}/commands/addworkoutfromlibraryitem`,
        data: {
          athleteId,
          exerciseLibraryItemId: item_id,
          workoutDateTime: date,
        },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Scheduled "${workout.title}" on ${workout.workoutDay}.\n\n${formatWorkoutSummary(workout)}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "update_library",
    {
      description: "Rename an exercise library folder",
      inputSchema: {
        library_id: z.number().describe("Library ID to rename"),
        name: z.string().describe("New name for the library"),
      },
    },
    async ({ library_id, name }) => {
      const library = await renameLibrary(library_id, name);
      return {
        content: [{ type: "text" as const, text: `Library renamed to "${library.libraryName}".` }],
      };
    }
  );

  mcp.registerTool(
    "move_library_item",
    {
      description: "Move a workout template from one exercise library folder to another",
      inputSchema: {
        from_library_id: z.number().describe("Source library ID"),
        item_id: z.number().describe("Exercise library item ID to move"),
        to_library_id: z.number().describe("Destination library ID"),
      },
    },
    async ({ from_library_id, item_id, to_library_id }) => {
      const item = await moveLibraryItem(from_library_id, item_id, to_library_id);
      return {
        content: [
          {
            type: "text" as const,
            text: `Moved "${item.itemName}" to library ${to_library_id}.`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "update_library_item",
    {
      description:
        "Edit a workout template in an exercise library (rename, change description, structure, etc.)",
      inputSchema: {
        library_id: z.number().describe("Library ID containing the item"),
        item_id: z.number().describe("Exercise library item ID to update"),
        name: z.string().optional().describe("New template name"),
        sport: z.enum(LIBRARY_SPORT_ENUM).optional().describe("New sport type"),
        description: z.string().optional().describe("New description"),
        duration_hours: z.number().optional().describe("Planned duration in hours"),
        distance_planned: z.number().optional().describe("Planned distance in meters"),
        tss: z.number().optional().describe("Planned TSS"),
        if_value: z.number().optional().describe("Planned Intensity Factor"),
        structure: z
          .string()
          .optional()
          .describe("New interval structure JSON string (same format as create_workout)"),
      },
    },
    async (params) => {
      const updates: Partial<ExerciseLibraryItem> = {};
      if (params.name !== undefined) updates.itemName = params.name;
      if (params.sport !== undefined) updates.workoutTypeId = SportNameToId[params.sport];
      if (params.description !== undefined) updates.description = params.description;
      if (params.duration_hours !== undefined) updates.totalTimePlanned = params.duration_hours;
      if (params.distance_planned !== undefined) updates.distancePlanned = params.distance_planned;
      if (params.tss !== undefined) updates.tssPlanned = params.tss;
      if (params.if_value !== undefined) updates.ifPlanned = params.if_value;
      if (params.structure !== undefined) {
        updates.structure = JSON.parse(resolveStructure(params.structure)) as Record<
          string,
          unknown
        >;
      }
      const item = await updateLibraryItem(params.library_id, params.item_id, updates);
      return {
        content: [
          { type: "text" as const, text: `Library item updated.\n\n${formatLibraryItem(item)}` },
        ],
      };
    }
  );

  mcp.registerTool(
    "delete_library_item",
    {
      description: "Delete a workout template from an exercise library folder",
      inputSchema: {
        library_id: z.number().describe("Library ID containing the item"),
        item_id: z.number().describe("Exercise library item ID to delete"),
      },
    },
    async ({ library_id, item_id }) => {
      await deleteLibraryItem(library_id, item_id);
      return {
        content: [{ type: "text" as const, text: `Library item ${item_id} deleted.` }],
      };
    }
  );

  mcp.registerTool(
    "delete_library",
    {
      description: "Delete an exercise library folder and all its templates",
      inputSchema: {
        library_id: z.number().describe("Library ID to delete"),
      },
    },
    async ({ library_id }) => {
      await deleteLibrary(library_id);
      return {
        content: [{ type: "text" as const, text: `Library ${library_id} deleted successfully.` }],
      };
    }
  );
}
