import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "../api.js";
import { getAthleteId } from "../auth.js";

// Equipment (bikes, shoes) from /fitness/v1/athletes/{id}/equipment

interface BaseEquipment {
  equipmentId: number;
  athleteId: number;
  name: string;
  notes?: string | null;
  brand?: string;
  model?: string;
  dateOfPurchase?: string; // ISO date string
  retired: boolean;
  retiredDate?: string | null;
  isDefault: boolean;
  startingDistance: number; // metres
  actualDistance: number; // metres logged in TP
  maxDistance: number | null; // metres (0 or null = no limit)
}

export interface BikeEquipment extends BaseEquipment {
  type: 1;
  wheels?: string;
  crankLengthMillimeters?: number;
}

export interface ShoeEquipment extends BaseEquipment {
  type: 2;
}

export type Equipment = BikeEquipment | ShoeEquipment;

// ─── API functions ────────────────────────────────────────────────────────────

export async function getEquipment(): Promise<Equipment[]> {
  const athleteId = await getAthleteId();
  return api<Equipment[]>({
    method: "get",
    path: `/fitness/v1/athletes/${athleteId}/equipment`,
  });
}

// Updatable fields common to all equipment types.
type BaseEquipmentUpdates = Partial<
  Pick<
    Equipment,
    | "name"
    | "brand"
    | "model"
    | "notes"
    | "dateOfPurchase"
    | "retired"
    | "retiredDate"
    | "isDefault"
    | "maxDistance"
    | "startingDistance"
  >
>;

// Bike-specific updatable fields — only valid when the item has type 1.
type BikeEquipmentUpdates = Partial<Pick<BikeEquipment, "wheels" | "crankLengthMillimeters">>;

export type EquipmentUpdates = BaseEquipmentUpdates & BikeEquipmentUpdates;

// Update a single equipment item. The API requires the full array to be PUT back.
// Throws if bike-only fields (wheels, crankLengthMillimeters) are supplied for a shoe.
export async function updateEquipmentItem(
  equipmentId: number,
  updates: EquipmentUpdates
): Promise<Equipment[]> {
  const [items, athleteId] = await Promise.all([getEquipment(), getAthleteId()]);
  const idx = items.findIndex((e) => e.equipmentId === equipmentId);
  if (idx === -1) throw new Error(`Equipment ID ${equipmentId} not found.`);

  const item = items[idx];
  if (
    item.type === 2 &&
    (updates.wheels !== undefined || updates.crankLengthMillimeters !== undefined)
  ) {
    throw new Error("Wheels and crank length are bike-only fields and cannot be set on a shoe.");
  }

  const updated = items.map((e, i) => (i === idx ? { ...e, ...updates } : e));
  return api<Equipment[]>({
    method: "put",
    path: `/fitness/v1/athletes/${athleteId}/equipment`,
    data: updated,
  });
}

// Add a new equipment item. The API requires the full array to be PUT back with
// equipmentId: null for the new entry — the server assigns the real ID.
export async function addEquipmentItem(item: {
  name: string;
  type: 1 | 2;
  brand?: string;
  model?: string;
  notes?: string;
  dateOfPurchase?: string;
  startingDistance?: number;
  maxDistance?: number | null;
  isDefault?: boolean;
  wheels?: string | null;
  crankLengthMillimeters?: number;
}): Promise<Equipment> {
  const [items, athleteId] = await Promise.all([getEquipment(), getAthleteId()]);
  const existingIds = new Set(items.map((e) => e.equipmentId));

  const newItem = {
    equipmentId: null,
    name: item.name,
    notes: item.notes ?? null,
    brand: item.brand ?? null,
    model: item.model ?? null,
    dateOfPurchase: item.dateOfPurchase ?? new Date().toISOString().slice(0, 10),
    athleteId,
    retired: false,
    retiredDate: "",
    isDefault: item.isDefault ?? false,
    startingDistance: item.startingDistance ?? 0,
    actualDistance: null,
    crankLengthMillimeters: item.crankLengthMillimeters ?? 172.5,
    wheels: item.wheels ?? null,
    maxDistance: item.maxDistance ?? null,
    type: item.type,
  };

  const result = await api<Equipment[]>({
    method: "put",
    path: `/fitness/v1/athletes/${athleteId}/equipment`,
    data: [...items, newItem],
  });

  const added = result.find((e) => !existingIds.has(e.equipmentId));
  if (!added)
    throw new Error("Equipment added but could not identify the new item in the response.");
  return added;
}

// Delete an equipment item. GET full array, remove the item, PUT back.
export async function deleteEquipmentItem(equipmentId: number): Promise<void> {
  const [items, athleteId] = await Promise.all([getEquipment(), getAthleteId()]);
  const filtered = items.filter((e) => e.equipmentId !== equipmentId);
  if (filtered.length === items.length) throw new Error(`Equipment ID ${equipmentId} not found.`);
  await api<Equipment[]>({
    method: "put",
    path: `/fitness/v1/athletes/${athleteId}/equipment`,
    data: filtered,
  });
}

// ─── Display utilities ────────────────────────────────────────────────────────

function formatEquipment(e: Equipment): string {
  const typeName = e.type === 1 ? "Bike" : "Shoe";
  const km = (m: number) => `${Math.round(m / 1000).toLocaleString()} km`;
  const totalKm = e.startingDistance + e.actualDistance;
  const lines = [
    `[${typeName}] ${e.name}${e.retired ? " (retired)" : ""}${e.isDefault ? " ★ default" : ""}`,
    `Brand/Model: ${e.brand ?? "—"} / ${e.model ?? "—"}`,
    `Purchased: ${e.dateOfPurchase ? e.dateOfPurchase.slice(0, 10) : "—"}`,
    `Distance: ${km(totalKm)} total (${km(e.actualDistance)} logged + ${km(e.startingDistance)} starting)`,
  ];
  if (e.maxDistance !== null && e.maxDistance > 0) {
    const remaining = e.maxDistance - totalKm;
    if (remaining > 0) {
      lines.push(`Retirement threshold: ${km(e.maxDistance)} — ${km(remaining)} remaining`);
    } else {
      lines.push(`Retirement threshold: ${km(e.maxDistance)} — OVERDUE by ${km(-remaining)}`);
    }
  }
  if (e.retiredDate) lines.push(`Retired: ${e.retiredDate.slice(0, 10)}`);
  if (e.type === 1) {
    if (e.wheels) lines.push(`Wheels: ${e.wheels}`);
    if (e.crankLengthMillimeters) lines.push(`Crank: ${e.crankLengthMillimeters} mm`);
  }
  if (e.notes) lines.push(`Notes: ${e.notes}`);
  lines.push(`ID: ${e.equipmentId}`);
  return lines.join("\n");
}

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerEquipmentTools(mcp: McpServer): void {
  mcp.registerTool(
    "get_equipment",
    {
      description:
        "List bikes and shoes with distance tracking, retirement status, and equipment details",
      inputSchema: {
        type: z
          .enum(["bike", "shoe", "all"])
          .optional()
          .default("all")
          .describe("Filter by type: bike, shoe, or all (default: all)"),
      },
    },
    async ({ type }) => {
      const equipment = await getEquipment();
      const typeFilter = type === "bike" ? 1 : type === "shoe" ? 2 : null;
      const filtered =
        typeFilter !== null ? equipment.filter((e) => e.type === typeFilter) : equipment;
      if (filtered.length === 0) {
        return { content: [{ type: "text" as const, text: "No equipment found." }] };
      }
      const text = filtered.map(formatEquipment).join("\n\n---\n\n");
      return {
        content: [{ type: "text" as const, text: `${filtered.length} item(s):\n\n${text}` }],
      };
    }
  );

  mcp.registerTool(
    "create_equipment",
    {
      description: "Add a new bike or shoe to the equipment list",
      inputSchema: {
        name: z.string().describe("Equipment name (e.g. 'Canyon Speedmax CF SLX 8 AXS')"),
        type: z.enum(["bike", "shoe"]).describe("Equipment type"),
        brand: z.string().optional().describe("Brand name"),
        model: z.string().optional().describe("Model name"),
        notes: z.string().optional().describe("Free-text notes"),
        date_of_purchase: z
          .string()
          .optional()
          .describe("Purchase date in YYYY-MM-DD format (defaults to today)"),
        starting_distance_km: z
          .number()
          .optional()
          .describe(
            "Starting odometer in km (use if item has prior mileage, e.g. bought second-hand)"
          ),
        max_distance_km: z
          .number()
          .optional()
          .describe("Retirement distance threshold in km (omit or 0 for no limit)"),
        is_default: z.boolean().optional().describe("Set as default equipment for its type"),
        wheels: z.string().optional().describe("Wheel description (bikes only)"),
        crank_length_mm: z
          .number()
          .optional()
          .describe("Crank length in mm (bikes only, e.g. 172.5)"),
      },
    },
    async (params) => {
      if (
        params.type === "shoe" &&
        (params.wheels !== undefined || params.crank_length_mm !== undefined)
      ) {
        throw new Error(
          "Wheels and crank length are bike-only fields and cannot be set on a shoe."
        );
      }
      const eq = await addEquipmentItem({
        name: params.name,
        type: params.type === "bike" ? 1 : 2,
        brand: params.brand,
        model: params.model,
        notes: params.notes,
        dateOfPurchase: params.date_of_purchase,
        startingDistance:
          params.starting_distance_km !== undefined
            ? Math.round(params.starting_distance_km * 1000)
            : undefined,
        maxDistance:
          params.max_distance_km !== undefined && params.max_distance_km > 0
            ? Math.round(params.max_distance_km * 1000)
            : null,
        isDefault: params.is_default,
        ...(params.type === "bike"
          ? { wheels: params.wheels, crankLengthMillimeters: params.crank_length_mm }
          : {}),
      });
      const lines = [
        `Equipment added: ${eq.name}`,
        `ID: ${eq.equipmentId}`,
        `Type: ${eq.type === 1 ? "Bike" : "Shoe"}`,
      ];
      if (eq.brand || eq.model) lines.push(`${eq.brand ?? ""} ${eq.model ?? ""}`.trim());
      if (eq.startingDistance)
        lines.push(`Starting distance: ${(eq.startingDistance / 1000).toFixed(1)} km`);
      if (eq.maxDistance) lines.push(`Retirement at: ${(eq.maxDistance / 1000).toFixed(0)} km`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  mcp.registerTool(
    "update_equipment_item",
    {
      description: "Update a piece of equipment (rename, retire, set retirement distance, etc.)",
      inputSchema: {
        equipment_id: z.number().describe("ID of the equipment item to update"),
        name: z.string().optional().describe("New name"),
        brand: z.string().optional().describe("Brand name"),
        model: z.string().optional().describe("Model name"),
        notes: z.string().optional().describe("Notes or description"),
        date_of_purchase: z.string().optional().describe("Purchase date in YYYY-MM-DD format"),
        retired: z.boolean().optional().describe("Mark as retired (true) or active (false)"),
        retired_date: z
          .string()
          .optional()
          .describe("Date retired in YYYY-MM-DD format (set automatically to today if retiring)"),
        is_default: z.boolean().optional().describe("Set as default equipment"),
        max_distance_km: z
          .number()
          .optional()
          .describe("Retirement distance threshold in km (0 = no limit)"),
        wheels: z.string().optional().describe("Wheel description (bikes only)"),
        crank_length_mm: z
          .number()
          .optional()
          .describe("Crank length in mm (bikes only, e.g. 172.5)"),
        starting_distance_km: z.number().optional().describe("Starting odometer value in km"),
      },
    },
    async (params) => {
      const updates: EquipmentUpdates = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.brand !== undefined) updates.brand = params.brand;
      if (params.model !== undefined) updates.model = params.model;
      if (params.notes !== undefined) updates.notes = params.notes;
      if (params.date_of_purchase !== undefined) updates.dateOfPurchase = params.date_of_purchase;
      if (params.retired !== undefined) updates.retired = params.retired;
      if (params.retired_date !== undefined)
        updates.retiredDate = `${params.retired_date}T00:00:00`;
      else if (params.retired === true)
        updates.retiredDate = `${new Date().toISOString().slice(0, 10)}T00:00:00`;
      if (params.is_default !== undefined) updates.isDefault = params.is_default;
      if (params.max_distance_km !== undefined)
        updates.maxDistance = params.max_distance_km === 0 ? null : params.max_distance_km * 1000;
      if (params.wheels !== undefined) updates.wheels = params.wheels;
      if (params.crank_length_mm !== undefined)
        updates.crankLengthMillimeters = params.crank_length_mm;
      if (params.starting_distance_km !== undefined)
        updates.startingDistance = params.starting_distance_km * 1000;

      const allEquipment = await updateEquipmentItem(params.equipment_id, updates);
      const updated = allEquipment.find((e) => e.equipmentId === params.equipment_id)!;
      return {
        content: [
          {
            type: "text" as const,
            text: `Equipment updated successfully.\n\n${formatEquipment(updated)}`,
          },
        ],
      };
    }
  );

  mcp.registerTool(
    "delete_equipment",
    {
      description: "Permanently delete a bike or shoe from the equipment list",
      inputSchema: {
        equipment_id: z
          .number()
          .describe("ID of the equipment item to delete (from get_equipment)"),
      },
    },
    async ({ equipment_id }) => {
      await deleteEquipmentItem(equipment_id);
      return {
        content: [
          { type: "text" as const, text: `Equipment ${equipment_id} deleted successfully.` },
        ],
      };
    }
  );
}
