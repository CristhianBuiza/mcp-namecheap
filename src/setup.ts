import { realpathSync } from "node:fs";
import { sep } from "node:path";
import { NamecheapClient } from "./client.js";
import { createPrompter } from "./prompt.js";
import { readSettings, settingsFile, writeSettings, type Settings } from "./settings.js";

const isTrue = (v?: string) => ["1", "true", "yes"].includes((v ?? "").toLowerCase());

function clientConfigSnippet(): string {
  const entry = realpathSync(process.argv[1]);
  const server = entry.includes(`${sep}_npx${sep}`)
    ? { command: "npx", args: ["-y", "github:CristhianBuiza/mcp-namecheap"] }
    : { command: "node", args: [entry] };
  return JSON.stringify({ mcpServers: { namecheap: server } }, null, 2);
}

/** Interactive first-run setup. Returns the process exit code. */
export async function runSetup(): Promise<number> {
  const file = settingsFile();
  const saved = readSettings(file);
  const p = createPrompter();
  try {
    console.log("Namecheap MCP setup\n");
    console.log(`Your answers are saved to ${file} (readable only by you).`);
    console.log("Get your API key in Namecheap: Profile > Tools > API Access.");
    console.log("Add this machine's public IP to the whitelist on that same page.\n");

    let apiUser = "";
    while (!apiUser) apiUser = await p.text("API username", saved.NAMECHEAP_API_USER);
    let apiKey = "";
    while (!apiKey) {
      apiKey = (await p.secret("API key", Boolean(saved.NAMECHEAP_API_KEY))) || saved.NAMECHEAP_API_KEY || "";
    }
    const userName = await p.text("Account username", saved.NAMECHEAP_USERNAME || apiUser);
    const ipAnswer = await p.text("Whitelisted public IP (auto = detect it)", saved.NAMECHEAP_CLIENT_IP || "auto");
    const clientIp = ipAnswer.toLowerCase() === "auto" ? "" : ipAnswer;
    const sandbox = await p.confirm("Use the sandbox API (api.sandbox.namecheap.com)?", isTrue(saved.NAMECHEAP_SANDBOX));
    const purchases = await p.confirm(
      "Enable register_domain / renew_domain? They charge your balance",
      isTrue(saved.NAMECHEAP_ENABLE_PURCHASES),
    );

    if (await p.confirm("Test the connection now?", true)) {
      try {
        const client = new NamecheapClient({ apiUser, apiKey, userName, clientIp: clientIp || undefined, sandbox });
        const res = await client.call("namecheap.users.getBalances");
        const r = res.UserGetBalancesResult ?? {};
        console.log(`Connected. Available balance: ${r.AvailableBalance ?? "?"} ${r.Currency ?? ""}`.trimEnd());
      } catch (error) {
        console.log(`Connection failed: ${(error as Error).message}`);
        if (!(await p.confirm("Save these settings anyway?", false))) {
          console.log("Nothing was saved.");
          return 1;
        }
      }
    }

    const settings: Settings = {
      NAMECHEAP_API_USER: apiUser,
      NAMECHEAP_API_KEY: apiKey,
      NAMECHEAP_USERNAME: userName,
      ...(clientIp && { NAMECHEAP_CLIENT_IP: clientIp }),
      NAMECHEAP_SANDBOX: String(sandbox),
      NAMECHEAP_ENABLE_PURCHASES: String(purchases),
    };
    writeSettings(settings, file);

    console.log(`\nSaved to ${file}.`);
    console.log("\nAdd the server to your MCP client (for Cursor: ~/.cursor/mcp.json), then reload it:\n");
    console.log(clientConfigSnippet());
    return 0;
  } catch (error) {
    console.error(`\n${(error as Error).message}`);
    return 1;
  } finally {
    p.close();
  }
}
