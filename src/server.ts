import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerUserTools } from "./api/user.js";
import { registerWorkoutTools } from "./api/workouts.js";
import { registerFitnessTools } from "./api/fitness.js";
import { registerEquipmentTools } from "./api/equipment.js";
import { registerSettingsTools } from "./api/settings.js";
import { registerEventTools } from "./api/events.js";
import { registerLibraryTools } from "./api/library.js";
import { registerStrengthTools } from "./api/strength.js";
import { registerMetricTools } from "./api/metrics.js";

const mcp = new McpServer(
  { name: "trainingpeaks", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

registerUserTools(mcp);
registerWorkoutTools(mcp);
registerFitnessTools(mcp);
registerEquipmentTools(mcp);
registerSettingsTools(mcp);
registerEventTools(mcp);
registerLibraryTools(mcp);
registerStrengthTools(mcp);
registerMetricTools(mcp);

export async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  process.stderr.write("TrainingPeaks MCP server running on stdio\n");
}
