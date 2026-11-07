#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NamecheapClient } from "./client.js";
import { applySettings, settingsFile } from "./settings.js";
import { runSetup } from "./setup.js";
import { registerAccountTools } from "./tools/account.js";
import { registerDnsTools } from "./tools/dns.js";
import { registerDomainTools } from "./tools/domains.js";

const command = process.argv[2];
if (command === "setup") process.exit(await runSetup());
if (command) {
  console.error(`Unknown command "${command}". Usage: mcp-namecheap [setup]`);
  process.exit(1);
}

// Precedence: MCP client env > saved setup (settingsFile) > .env next to the package.
try {
  applySettings();
} catch (error) {
  console.error(`mcp-namecheap: ignoring ${settingsFile()}: ${(error as Error).message}`);
}
const envFile = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isTrue = (v?: string) => ["1", "true", "yes"].includes((v ?? "").toLowerCase());

let client: NamecheapClient | undefined;
function getClient(): NamecheapClient {
  if (client) return client;
  const apiUser = env.NAMECHEAP_API_USER;
  const apiKey = env.NAMECHEAP_API_KEY;
  if (!apiUser || !apiKey) {
    throw new Error(
      'Namecheap is not configured yet. Run "npx -y github:CristhianBuiza/mcp-namecheap setup" ' +
        '(or "npm run setup" in a clone), then reload the MCP server. ' +
        "Alternatively set NAMECHEAP_API_USER and NAMECHEAP_API_KEY in the MCP config env.",
    );
  }
  client = new NamecheapClient({
    apiUser,
    apiKey,
    userName: env.NAMECHEAP_USERNAME || apiUser,
    clientIp: env.NAMECHEAP_CLIENT_IP || undefined,
    sandbox: isTrue(env.NAMECHEAP_SANDBOX),
  });
  return client;
}

const server = new McpServer({ name: "namecheap", version: "1.0.0" });

registerAccountTools(server, getClient);
registerDomainTools(server, getClient, isTrue(env.NAMECHEAP_ENABLE_PURCHASES));
registerDnsTools(server, getClient);

await server.connect(new StdioServerTransport());
