import axios from "axios";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "../api.js";
import { getAthleteId } from "../auth.js";
import { SportNameToId } from "./workouts.js";

// Focus event (primary goal race) from /fitness/v6/athletes/{id}/events/focusevent

export interface FocusEventResult {
  resultType: "Division" | "Gender" | "Overall";
  place?: number | null;
  entrants?: number | null;
}

export interface FocusEventGoals {
  athleteEventId: number;
  athleteId: number;
  distance?: number | null;
  time?: number | null; // seconds
  place?: number | null;
  finish?: string | null;
  pr?: boolean | null;
  written?: string[];
}

// Valid EventType values from Partner API docs
export type EventType =
  | "RoadRunning"
  | "TrailRunning"
  | "TrackRunning"
  | "CrossCountry"
  | "Running"
  | "RoadCycling"
  | "MountainBiking"
  | "Cyclocross"
  | "TrackCycling"
  | "Cycling"
  | "OpenWaterSwimming"
  | "PoolSwimming"
  | "Triathlon"
  | "Xterra"
  | "Duathlon"
  | "Aquabike"
  | "Aquathon"
  | "Multisport"
  | "Regatta"
  | "Rowing"
  | "AlpineSkiing"
  | "NordicSkiing"
  | "SkiMountaineering"
  | "Snowshoe"
  | "Snow"
  | "Adventure"
  | "Obstacle"
  | "SpeedSkate"
  | "Other";

export interface FocusEvent {
  id: number;
  personId: number;
  eventDate: string; // ISO datetime
  name: string;
  eventType: EventType | string;
  description?: string | null;
  comment?: string | null;
  workoutIds?: number[]; // read-only
  results: FocusEventResult[];
  goals: FocusEventGoals;
  atpPriority?: "A" | "B" | "C" | null;
  raceTypeDuration?: string | null;
  isHidden: boolean;
  isLocked: boolean;
  ctlTarget?: number | null;
  distance?: number | null;
  distanceUnits?: string | null;
}

export interface GoalItem {
  id: number | null;
  athleteId: number;
  goalListId: number | null;
  type: "Written" | string;
  activityType: "GOAL";
  sortOrder: number;
  stringValue: string | null;
  doubleValue: number | null;
  intValue: number | null;
  boolValue: boolean | null;
  value: { value: string; label: string };
  complete: boolean;
  changed: boolean;
  setByPersonId: number | null;
  athleteEventId: number | null;
}

export interface GoalList {
  id: number | null;
  athleteId: number;
  title: string;
  activityType: "GOAL_LIST";
  activityDate: string; // YYYY-MM-DD
  achieveBy: string; // YYYY-MM-DD
  activityTime: string | null;
  goals: GoalItem[];
  isFuture: boolean;
  isToday: boolean;
  isPast: boolean;
  isFullyCompliant: boolean;
  isPartiallyCompliant: boolean;
  isNotCompliant: boolean;
}

// ─── Availability from /fitness/v1/athletes/{id}/availability ────────────────

export interface Availability {
  id: number;
  personId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  limitedAvailability: boolean; // always false in API responses; use type field instead
  reason?: string | null;
  availableSportTypes: number[]; // populated when type=2 (limited availability)
  description?: string | null;
  type: number; // 1=Unavailable, 2=Limited availability
}

// ─── Calendar Note from /fitness/v1/athletes/{id}/calendarNote ───────────────

export interface CalendarNoteComment {
  calendarNoteId: number;
  calendarNoteCommentStreamId: number;
  comment: string;
  commenterPersonId: number;
  createdDateTimeUtc: string;
  updatedDateTimeUtc: string;
  firstName: string;
  lastName: string;
  commenterPhotoUrl?: string | null;
}

export interface CalendarNote {
  noteId: number;
  athleteId: number;
  title: string;
  noteDate: string; // ISO datetime
  description?: string | null;
  isHidden: boolean;
  attachments: unknown[];
}

const EVENT_TYPES = [
  "RoadRunning",
  "TrailRunning",
  "TrackRunning",
  "CrossCountry",
  "Running",
  "RoadCycling",
  "MountainBiking",
  "Cyclocross",
  "TrackCycling",
  "Cycling",
  "OpenWaterSwimming",
  "PoolSwimming",
  "Triathlon",
  "Xterra",
  "Duathlon",
  "Aquabike",
  "Aquathon",
  "Multisport",
  "Regatta",
  "Rowing",
  "AlpineSkiing",
  "NordicSkiing",
  "SkiMountaineering",
  "Snowshoe",
  "Snow",
  "Adventure",
  "Obstacle",
  "SpeedSkate",
  "Other",
  "MultisportTriathlon",
] as const;

// ─── API functions ────────────────────────────────────────────────────────────

async function getSingleEvent(slug: string): Promise<FocusEvent | null> {
  const athleteId = await getAthleteId();
  try {
    return await api<FocusEvent>({
      method: "get",
      path: `/fitness/v6/athletes/${athleteId}/events/${slug}`,
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

export function getFocusEvent(): Promise<FocusEvent | null> {
  return getSingleEvent("focusevent");
}

export function getNextPlannedEvent(): Promise<FocusEvent | null> {
  return getSingleEvent("nextplannedevent");
}

export async function getEvents(startDate: string, endDate: string): Promise<FocusEvent[]> {
  const athleteId = await getAthleteId();
  return api<FocusEvent[]>({
    method: "get",
    path: `/fitness/v6/athletes/${athleteId}/events/${startDate}/${endDate}`,
  });
}

export async function createEvent(data: {
  name: string;
  eventDate: string;
  eventType: string;
  description?: string;
  atpPriority?: "A" | "B" | "C";
  distance?: number;
  distanceUnits?: string;
  ctlTarget?: number;
}): Promise<FocusEvent> {
  const athleteId = await getAthleteId();
  return api<FocusEvent>({
    method: "post",
    path: `/fitness/v6/athletes/${athleteId}/events`,
    data: { athleteId, ...data, eventDate: `${data.eventDate}T00:00:00` },
  });
}

export async function getEvent(eventId: number): Promise<FocusEvent> {
  const athleteId = await getAthleteId();
  // No single-event GET endpoint; search ±2 years from today
  const now = new Date();
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 2);
  const end = new Date(now);
  end.setFullYear(now.getFullYear() + 2);
  const events = await api<FocusEvent[]>({
    method: "get",
    path: `/fitness/v6/athletes/${athleteId}/events/${start.toISOString().slice(0, 10)}/${end.toISOString().slice(0, 10)}`,
  });
  const event = events.find((e) => e.id === eventId);
  if (!event) throw new Error(`Event ${eventId} not found`);
  return event;
}

export async function updateEvent(
  eventId: number,
  updates: Partial<FocusEvent>
): Promise<FocusEvent> {
  const athleteId = await getAthleteId();
  const existing = await getEvent(eventId);
  const merged = { ...existing, ...updates, personId: athleteId };
  return api<FocusEvent>({
    method: "put",
    path: `/fitness/v6/athletes/${athleteId}/event`,
    data: merged,
  });
}

export async function deleteEvent(eventId: number): Promise<void> {
  const athleteId = await getAthleteId();
  await api<unknown>({
    method: "delete",
    path: `/fitness/v6/athletes/${athleteId}/events/${eventId}`,
  });
}

export async function createCalendarNote(
  date: string,
  title: string,
  description?: string
): Promise<CalendarNote> {
  const athleteId = await getAthleteId();
  return api<CalendarNote>({
    method: "post",
    path: `/fitness/v1/athletes/${athleteId}/calendarNote`,
    data: {
      athleteId,
      title,
      noteDate: `${date}T00:00:00`,
      description: description ?? "",
      isHidden: false,
      attachments: [],
    },
  });
}

export async function getCalendarNote(noteId: number): Promise<CalendarNote> {
  const athleteId = await getAthleteId();
  return api<CalendarNote>({
    method: "get",
    path: `/fitness/v1/athletes/${athleteId}/calendarNote/${noteId}`,
  });
}

export async function updateCalendarNote(
  noteId: number,
  updates: { title?: string; description?: string; date?: string }
): Promise<CalendarNote> {
  const athleteId = await getAthleteId();
  const existing = await getCalendarNote(noteId);
  return api<CalendarNote>({
    method: "put",
    path: `/fitness/v1/athletes/${athleteId}/calendarNote/${noteId}`,
    data: {
      ...existing,
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      noteDate: updates.date ? `${updates.date}T00:00:00` : existing.noteDate,
      id: noteId,
      athleteId,
      ownerId: athleteId,
      parentPlanNoteId: 0,
      appliedPlanId: 0,
    },
  });
}

export async function addCalendarNoteComment(
  noteId: number,
  comment: string,
  commentStreamId?: number
): Promise<void> {
  const athleteId = await getAthleteId();
  const data: Record<string, unknown> = { Comment: comment };
  if (commentStreamId !== undefined) data.CalendarNoteCommentStreamId = commentStreamId;
  await api<unknown>({
    method: "put",
    path: `/fitness/v1/athletes/${athleteId}/calendarNote/${noteId}/comment`,
    data,
  });
}

export async function getNoteComments(noteId: number): Promise<CalendarNoteComment[]> {
  const athleteId = await getAthleteId();
  return api<CalendarNoteComment[]>({
    method: "get",
    path: `/fitness/v1/athletes/${athleteId}/calendarNote/${noteId}/comments`,
  });
}

export async function deleteCalendarNote(noteId: number): Promise<void> {
  const athleteId = await getAthleteId();
  await api<unknown>({
    method: "delete",
    path: `/fitness/v1/athletes/${athleteId}/calendarNote/${noteId}`,
  });
}

export async function getAvailability(startDate: string, endDate: string): Promise<Availability[]> {
  const athleteId = await getAthleteId();
  return api<Availability[]>({
    method: "get",
    path: `/fitness/v1/athletes/${athleteId}/availability/${startDate}/${endDate}`,
  });
}

interface AvailabilityInput {
  startDate: string;
  endDate: string;
  limited: boolean; // true → type 2 (limited), false → type 1 (unavailable)
  reason?: string;
  availableSportTypes?: number[];
  description?: string;
}

function buildAvailabilityBody(
  athleteId: number,
  data: AvailabilityInput,
  id?: number
): Record<string, unknown> {
  return {
    ...(id !== undefined && { id }),
    personId: athleteId,
    startDate: id !== undefined ? `${data.startDate}T00:00:00` : data.startDate,
    endDate: id !== undefined ? `${data.endDate}T00:00:00` : data.endDate,
    limitedAvailability: false,
    reason: data.reason ?? null,
    availableSportTypes: data.limited ? (data.availableSportTypes ?? []) : [],
    description: data.description ?? null,
    type: data.limited ? 2 : 1,
  };
}

export async function createAvailability(data: AvailabilityInput): Promise<Availability> {
  const athleteId = await getAthleteId();
  return api<Availability>({
    method: "post",
    path: `/fitness/v1/athletes/${athleteId}/availability`,
    data: buildAvailabilityBody(athleteId, data),
  });
}

export async function updateAvailability(
  availabilityId: number,
  data: AvailabilityInput
): Promise<Availability> {
  const athleteId = await getAthleteId();
  return api<Availability>({
    method: "put",
    path: `/fitness/v1/athletes/${athleteId}/availability/${availabilityId}`,
    data: buildAvailabilityBody(athleteId, data, availabilityId),
  });
}

export async function deleteAvailability(availabilityId: number): Promise<void> {
  const athleteId = await getAthleteId();
  await api<unknown>({
    method: "delete",
    path: `/fitness/v1/athletes/${athleteId}/availability/${availabilityId}`,
  });
}

export async function createGoalList(
  date: string,
  title: string,
  goals: string[]
): Promise<GoalList> {
  const athleteId = await getAthleteId();
  const today = new Date().toISOString().slice(0, 10);
  const isFuture = date > today;
  const isToday = date === today;
  const isPast = date < today;
  const goalItems = goals.map((text, i) => ({
    doubleValue: null,
    stringValue: text,
    intValue: null,
    boolValue: null,
    setByPersonId: null,
    activityType: "GOAL" as const,
    goalListId: null,
    sortOrder: i,
    value: { value: text, label: "" },
    changed: true,
    athleteEventId: null,
    complete: false,
    type: "Written" as const,
    athleteId,
    id: null,
  }));
  return api<GoalList>({
    method: "post",
    path: `/fitness/v1/athletes/${athleteId}/goallists`,
    data: {
      goals: goalItems,
      achieveBy: date,
      activityType: "GOAL_LIST",
      isFuture,
      isNotCompliant: false,
      isToday,
      isPartiallyCompliant: false,
      title,
      athleteId,
      isFullyCompliant: false,
      id: null,
      isPast,
      activityTime: null,
      activityDate: date,
    },
  });
}

export async function deleteGoalList(goalListId: number): Promise<void> {
  const athleteId = await getAthleteId();
  await api<unknown>({
    method: "delete",
    path: `/fitness/v1/athletes/${athleteId}/goallists/${goalListId}`,
  });
}

// ─── Tool registration ───────────────────────────────────────────────────────

const AVAIL_SPORT_ENUM = [
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

function formatEventSummary(
  event: FocusEvent,
  opts?: { includeGoals?: boolean; includeResults?: boolean }
): string {
  const eventDateStr = event.eventDate.slice(0, 10);
  const daysUntil = Math.ceil(
    (new Date(eventDateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const lines = [
    `${event.name}`,
    `Date: ${eventDateStr}${daysUntil > 0 ? ` (${daysUntil} days away)` : daysUntil === 0 ? " (today!)" : ` (${-daysUntil} days ago)`}`,
    `Type: ${event.eventType}`,
    event.atpPriority ? `Priority: ${event.atpPriority}` : "",
    event.raceTypeDuration ? `Duration category: ${event.raceTypeDuration}` : "",
    event.ctlTarget != null ? `CTL target: ${event.ctlTarget}` : "",
    event.description ? `\nDescription: ${event.description}` : "",
    event.comment ? `\nComment: ${event.comment}` : "",
  ].filter(Boolean);

  if (opts?.includeGoals && event.goals) {
    const g = event.goals;
    const goalParts: string[] = [];
    if (g.time != null) {
      const h = Math.floor(g.time / 3600);
      const m = Math.floor((g.time % 3600) / 60);
      const s = g.time % 60;
      goalParts.push(`Time: ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }
    if (g.place != null) goalParts.push(`Place: ${g.place}`);
    if (g.pr) goalParts.push("Goal: PR");
    if (g.written && g.written.length > 0) goalParts.push(...g.written);
    if (goalParts.length > 0) lines.push(`\nGoals: ${goalParts.join(", ")}`);
  }

  if (opts?.includeResults) {
    const raced = event.results.some((r) => r.place != null);
    if (raced) {
      lines.push("\nResults:");
      for (const r of event.results) {
        if (r.place != null) {
          const of = r.entrants ? ` of ${r.entrants}` : "";
          lines.push(`  ${r.resultType}: ${r.place}${of}`);
        }
      }
    }
  }

  return lines.join("\n");
}

export function registerEventTools(mcp: McpServer): void {
  mcp.registerTool(
    "get_focus_event",
    {
      description:
        "Get the athlete's current focus (A-priority) race: name, date, event type, priority, goals, and results if already raced",
    },
    async () => {
      const event = await getFocusEvent();
      if (!event) {
        return { content: [{ type: "text" as const, text: "No focus event is currently set." }] };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: formatEventSummary(event, { includeGoals: true, includeResults: true }),
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "get_next_planned_event",
    {
      description:
        "Get the next upcoming planned event/race on the athlete's calendar (the nearest future event regardless of priority)",
    },
    async () => {
      const event = await getNextPlannedEvent();
      if (!event) {
        return { content: [{ type: "text" as const, text: "No upcoming planned events found." }] };
      }
      return { content: [{ type: "text" as const, text: formatEventSummary(event) }] };
    }
  );

  mcp.registerTool(
    "get_events",
    {
      description:
        "List all races and events in a date range, with priority, type, and days-until for each",
      inputSchema: {
        start_date: z.string().optional().describe("Start date YYYY-MM-DD (defaults to today)"),
        end_date: z
          .string()
          .optional()
          .describe("End date YYYY-MM-DD (defaults to 12 months from start)"),
      },
    },
    async ({ start_date, end_date }) => {
      const today = new Date().toISOString().slice(0, 10);
      const start = start_date ?? today;
      const defaultEnd = new Date(new Date(start).setFullYear(new Date(start).getFullYear() + 1))
        .toISOString()
        .slice(0, 10);
      const end = end_date ?? defaultEnd;
      const events = await getEvents(start, end);
      if (events.length === 0) {
        return {
          content: [
            { type: "text" as const, text: `No events found between ${start} and ${end}.` },
          ],
        };
      }
      const lines = events
        .filter((e) => !e.isHidden)
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
        .map((e) => {
          const date = e.eventDate.slice(0, 10);
          const daysUntil = Math.ceil(
            (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          const countdown =
            daysUntil > 0 ? `${daysUntil}d` : daysUntil === 0 ? "today" : `${-daysUntil}d ago`;
          const priority = e.atpPriority ? ` [${e.atpPriority}]` : "";
          const raced = e.results.some((r) => r.place != null);
          const status = raced ? " ✓" : "";
          return `${date} (${countdown})${priority}${status}  ${e.name}  — ${e.eventType}`;
        });
      return {
        content: [
          {
            type: "text" as const,
            text: `${lines.length} event(s) from ${start} to ${end}:\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "create_event",
    {
      description: "Add a race or event to the athlete's calendar",
      inputSchema: {
        name: z.string().describe("Event name"),
        date: z.string().describe("Event date in YYYY-MM-DD format"),
        event_type: z.enum(EVENT_TYPES).describe("Event type"),
        description: z.string().optional().describe("Event description"),
        priority: z.enum(["A", "B", "C"]).optional().describe("ATP race priority (A/B/C)"),
        distance: z.number().optional().describe("Race distance"),
        distance_units: z
          .string()
          .optional()
          .describe("Distance units (e.g. 'Miles', 'Kilometers', 'Meters')"),
        ctl_target: z.number().optional().describe("Target CTL for the event"),
      },
    },
    async (params) => {
      const event = await createEvent({
        name: params.name,
        eventDate: params.date,
        eventType: params.event_type,
        description: params.description,
        atpPriority: params.priority,
        distance: params.distance,
        distanceUnits: params.distance_units,
        ctlTarget: params.ctl_target,
      });
      const lines = [
        `Event created: ${event.name}`,
        `ID: ${event.id}`,
        `Date: ${event.eventDate.slice(0, 10)}`,
        `Type: ${event.eventType}`,
      ];
      if (event.atpPriority) lines.push(`Priority: ${event.atpPriority}`);
      if (event.distance != null)
        lines.push(`Distance: ${event.distance} ${event.distanceUnits ?? ""}`.trim());
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "delete_event",
    {
      description: "Delete a race or event from the athlete's calendar",
      inputSchema: {
        event_id: z.number().describe("Event ID (from get_events)"),
      },
    },
    async ({ event_id }) => {
      await deleteEvent(event_id);
      return {
        content: [{ type: "text" as const, text: `Event ${event_id} deleted successfully.` }],
      };
    }
  );

  mcp.registerTool(
    "update_event",
    {
      description:
        "Update a race or event on the athlete's calendar (name, date, priority, description, etc.)",
      inputSchema: {
        event_id: z.number().describe("Event ID (from get_events)"),
        name: z.string().optional().describe("New event name"),
        date: z.string().optional().describe("New event date in YYYY-MM-DD format"),
        event_type: z.enum(EVENT_TYPES).optional().describe("New event type"),
        description: z.string().optional().describe("New event description"),
        priority: z.enum(["A", "B", "C"]).optional().describe("New ATP race priority (A/B/C)"),
        distance: z.number().optional().describe("Race distance"),
        distance_units: z
          .string()
          .optional()
          .describe("Distance units (e.g. 'Miles', 'Kilometers', 'Meters')"),
        ctl_target: z.number().optional().describe("Target CTL for the event"),
      },
    },
    async (params) => {
      const updates: Partial<FocusEvent> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.date !== undefined) updates.eventDate = `${params.date}T00:00:00`;
      if (params.event_type !== undefined) updates.eventType = params.event_type;
      if (params.description !== undefined) updates.description = params.description;
      if (params.priority !== undefined) updates.atpPriority = params.priority;
      if (params.distance !== undefined) updates.distance = params.distance;
      if (params.distance_units !== undefined) updates.distanceUnits = params.distance_units;
      if (params.ctl_target !== undefined) updates.ctlTarget = params.ctl_target;
      const event = await updateEvent(params.event_id, updates);
      const lines = [
        `Event updated: ${event.name}`,
        `ID: ${event.id}`,
        `Date: ${event.eventDate.slice(0, 10)}`,
        `Type: ${event.eventType}`,
      ];
      if (event.atpPriority) lines.push(`Priority: ${event.atpPriority}`);
      if (event.description) lines.push(`Description: ${event.description}`);
      if (event.distance != null)
        lines.push(`Distance: ${event.distance} ${event.distanceUnits ?? ""}`.trim());
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "get_note",
    {
      description: "Get the details of a single calendar note",
      inputSchema: {
        note_id: z.number().describe("Calendar note ID"),
      },
    },
    async ({ note_id }) => {
      const note = await getCalendarNote(note_id);
      const lines = [`${note.title}`, `ID: ${note.noteId}`, `Date: ${note.noteDate.slice(0, 10)}`];
      if (note.description) lines.push(`Description: ${note.description}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "update_note",
    {
      description: "Update the title, description, or date of an existing calendar note",
      inputSchema: {
        note_id: z.number().describe("Calendar note ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description / body text"),
        date: z.string().optional().describe("New date in YYYY-MM-DD format"),
      },
    },
    async ({ note_id, title, description, date }) => {
      const note = await updateCalendarNote(note_id, { title, description, date });
      const lines = [
        `Note updated: "${note.title}"`,
        `ID: ${note.noteId}`,
        `Date: ${note.noteDate.slice(0, 10)}`,
      ];
      if (note.description) lines.push(`Description: ${note.description}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "get_note_comments",
    {
      description: "List all comments on a calendar note",
      inputSchema: {
        note_id: z.number().describe("Calendar note ID"),
      },
    },
    async ({ note_id }) => {
      const comments = await getNoteComments(note_id);
      if (comments.length === 0) {
        return { content: [{ type: "text" as const, text: "No comments on this note." }] };
      }
      const lines = comments.map((c) => {
        const ts = c.updatedDateTimeUtc ?? c.createdDateTimeUtc;
        const date = ts ? ts.slice(0, 16).replace("T", " ") : "";
        return `[${c.calendarNoteCommentStreamId}] ${c.firstName} ${c.lastName} (${date}):\n  ${c.comment}`;
      });
      return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
    }
  );

  mcp.registerTool(
    "add_note_comment",
    {
      description:
        "Add a new comment to a calendar note, or update an existing comment by providing comment_stream_id",
      inputSchema: {
        note_id: z.number().describe("Calendar note ID"),
        comment: z.string().describe("Comment text"),
        comment_stream_id: z
          .number()
          .optional()
          .describe("Existing comment stream ID to update (omit to add a new comment)"),
      },
    },
    async ({ note_id, comment, comment_stream_id }) => {
      await addCalendarNoteComment(note_id, comment, comment_stream_id);
      const action = comment_stream_id !== undefined ? "updated" : "added";
      return {
        content: [{ type: "text" as const, text: `Comment ${action} on note ${note_id}.` }],
      };
    }
  );

  mcp.registerTool(
    "create_note",
    {
      description:
        "Add a standalone text note to the athlete's calendar (distinct from a Day Off workout)",
      inputSchema: {
        date: z.string().describe("Date in YYYY-MM-DD format"),
        title: z.string().describe("Note title"),
        description: z.string().optional().describe("Note body text"),
      },
    },
    async ({ date, title, description }) => {
      const note = await createCalendarNote(date, title, description);
      const lines = [
        `Note created: "${note.title}"`,
        `ID: ${note.noteId}`,
        `Date: ${note.noteDate.slice(0, 10)}`,
      ];
      if (note.description) lines.push(`Description: ${note.description}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "delete_note",
    {
      description: "Delete a calendar note",
      inputSchema: {
        note_id: z.number().describe("Note ID (from create_note response)"),
      },
    },
    async ({ note_id }) => {
      await deleteCalendarNote(note_id);
      return {
        content: [{ type: "text" as const, text: `Note ${note_id} deleted successfully.` }],
      };
    }
  );

  mcp.registerTool(
    "get_availability",
    {
      description: "List availability entries (unavailable/limited periods) in a date range",
      inputSchema: {
        start_date: z.string().describe("Start date YYYY-MM-DD"),
        end_date: z.string().describe("End date YYYY-MM-DD"),
      },
    },
    async ({ start_date, end_date }) => {
      const entries = await getAvailability(start_date, end_date);
      if (entries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No availability entries found between ${start_date} and ${end_date}.`,
            },
          ],
        };
      }
      const idToSport = Object.fromEntries(
        Object.entries(SportNameToId).map(([name, id]) => [id, name])
      );
      const lines = entries.map((e) => {
        const start = e.startDate.slice(0, 10);
        const end = e.endDate.slice(0, 10);
        const range = start === end ? start : `${start} to ${end}`;
        const status = e.type === 2 ? "Limited" : "Unavailable";
        const sports =
          e.availableSportTypes.length > 0
            ? ` (available: ${e.availableSportTypes.map((id) => idToSport[id] ?? id).join(", ")})`
            : "";
        const parts = [`[${e.id}] ${range} — ${status}${sports}`];
        if (e.reason) parts.push(`  Reason: ${e.reason}`);
        if (e.description) parts.push(`  Details: ${e.description}`);
        return parts.join("\n");
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `${entries.length} availability entry/entries:\n\n${lines.join("\n\n")}`,
          },
        ],
      };
    }
  );

  const availabilitySchema = {
    start_date: z.string().describe("Start date YYYY-MM-DD"),
    end_date: z.string().optional().describe("End date YYYY-MM-DD (defaults to start_date)"),
    limited: z
      .boolean()
      .optional()
      .describe(
        "If true, athlete has limited availability (some sports still possible). " +
          "If false (default), athlete is fully unavailable."
      ),
    available_sports: z
      .array(z.enum(AVAIL_SPORT_ENUM))
      .optional()
      .describe("Sports still available when limited=true"),
    reason: z
      .string()
      .optional()
      .describe("Reason for unavailability (e.g. 'Injury', 'Travel', 'Work')"),
    description: z.string().optional().describe("Additional details"),
  };

  function parseAvailabilityParams(params: {
    start_date: string;
    end_date?: string;
    limited?: boolean;
    available_sports?: (typeof AVAIL_SPORT_ENUM)[number][];
    reason?: string;
    description?: string;
  }): AvailabilityInput {
    return {
      startDate: params.start_date,
      endDate: params.end_date ?? params.start_date,
      limited: params.limited ?? false,
      reason: params.reason,
      availableSportTypes: (params.available_sports ?? []).map(
        (s) => SportNameToId[s as keyof typeof SportNameToId]
      ),
      description: params.description,
    };
  }

  function formatAvailabilityResponse(action: string, entry: Availability): string {
    const start = entry.startDate.slice(0, 10);
    const end = entry.endDate.slice(0, 10);
    const lines = [
      `Availability ${action} (ID: ${entry.id})`,
      `Dates: ${start}${end !== start ? ` to ${end}` : ""}`,
      `Status: ${entry.type === 2 ? "Limited availability" : "Unavailable"}`,
    ];
    if (entry.reason) lines.push(`Reason: ${entry.reason}`);
    if (entry.description) lines.push(`Details: ${entry.description}`);
    return lines.join("\n");
  }

  mcp.registerTool(
    "create_availability",
    {
      description:
        "Mark a date range as unavailable or limited availability on the athlete's calendar " +
        "(e.g. injury, travel, work commitments)",
      inputSchema: availabilitySchema,
    },
    async (params) => {
      const entry = await createAvailability(parseAvailabilityParams(params));
      return {
        content: [{ type: "text" as const, text: formatAvailabilityResponse("created", entry) }],
      };
    }
  );

  mcp.registerTool(
    "update_availability",
    {
      description:
        "Update an existing availability entry (dates, status, reason, available sports)",
      inputSchema: {
        availability_id: z
          .number()
          .describe("Availability ID (from get_availability or create_availability)"),
        ...availabilitySchema,
      },
    },
    async (params) => {
      const entry = await updateAvailability(
        params.availability_id,
        parseAvailabilityParams(params)
      );
      return {
        content: [{ type: "text" as const, text: formatAvailabilityResponse("updated", entry) }],
      };
    }
  );

  mcp.registerTool(
    "delete_availability",
    {
      description: "Delete an availability entry from the athlete's calendar",
      inputSchema: {
        availability_id: z.number().describe("Availability ID (from create_availability response)"),
      },
    },
    async ({ availability_id }) => {
      await deleteAvailability(availability_id);
      return {
        content: [
          { type: "text" as const, text: `Availability ${availability_id} deleted successfully.` },
        ],
      };
    }
  );

  mcp.registerTool(
    "create_goal_list",
    {
      description: "Add a goal list to the athlete's calendar for a specific date",
      inputSchema: {
        date: z.string().describe("Target date in YYYY-MM-DD format"),
        title: z.string().describe("Goal list title (e.g. 'Goals for this week')"),
        goals: z.array(z.string()).min(1).describe("List of goal text strings"),
      },
    },
    async ({ date, title, goals }) => {
      const list = await createGoalList(date, title, goals);
      const lines = [
        `Goal list created: "${list.title}"`,
        `ID: ${list.id}`,
        `Date: ${list.activityDate}`,
        `Goals (${list.goals.length}):`,
        ...list.goals.map((g, i) => `  ${i + 1}. ${g.stringValue}`),
      ];
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "delete_goal_list",
    {
      description: "Delete a goal list from the athlete's calendar",
      inputSchema: {
        goal_list_id: z.number().describe("Goal list ID (from create_goal_list response)"),
      },
    },
    async ({ goal_list_id }) => {
      await deleteGoalList(goal_list_id);
      return {
        content: [
          { type: "text" as const, text: `Goal list ${goal_list_id} deleted successfully.` },
        ],
      };
    }
  );
}
