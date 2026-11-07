#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NamecheapClient } from "./client.js";
import { registerAccountTools } from "./tools/account.js";
import { registerDnsTools } from "./tools/dns.js";
import { registerDomainTools } from "./tools/domains.js";

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
      `Missing NAMECHEAP_API_USER / NAMECHEAP_API_KEY. Set them in the MCP config env or in ${envFile}.`,
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
