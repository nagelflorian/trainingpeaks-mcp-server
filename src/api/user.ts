import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api } from "../api.js";
import type { UserProfile } from "../auth.js";

export async function getUser(): Promise<UserProfile> {
  const data = await api<{ user: UserProfile }>({ method: "get", path: "/users/v3/user" });
  return data.user;
}

export function registerUserTools(mcp: McpServer): void {
  mcp.registerTool(
    "get_athlete_profile",
    { description: "Returns athlete name, premium status, and athlete ID" },
    async () => {
      const user = await getUser();
      const text = [
        `Name: ${user.firstName} ${user.lastName}`,
        `Email: ${user.email}`,
        `Athlete ID: ${user.userId}`,
        `Premium: ${user.settings?.account?.isPremium ? "Yes" : "No"}`,
      ].join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
