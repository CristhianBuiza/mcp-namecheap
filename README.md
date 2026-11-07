# mcp-namecheap

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for the [Namecheap API](https://www.namecheap.com/support/api/intro/). It lets AI agents and any MCP-compatible client (Cursor, Claude Desktop, VS Code, custom agents, etc.) manage domains, DNS records, nameservers, email forwarding and pricing in a Namecheap account.

- Runs locally over **stdio**; no extra service to host.
- **Guided setup:** one command asks for your credentials, tests them, and saves them to a private file. No env files to write by hand.
- Purchases (register / renew) are **disabled by default** and must be explicitly enabled.
- Tools carry MCP annotations (`readOnlyHint`, `destructiveHint`) so clients can ask for confirmation before risky actions.

## Quick start

```bash
npx -y github:CristhianBuiza/mcp-namecheap setup
```

Answer the questions, paste the printed snippet into your MCP client config, and reload the client. Details below.

---

## Table of contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Enable the Namecheap API](#1-enable-the-namecheap-api)
4. [Install](#2-install)
5. [Run the setup wizard](#3-run-the-setup-wizard)
6. [Connect it to an MCP client](#4-connect-it-to-an-mcp-client)
7. [Advanced: environment variables](#advanced-environment-variables)
8. [Tools reference](#tools-reference)
9. [Usage examples](#usage-examples)
10. [How it works](#how-it-works)
11. [Security notes](#security-notes)
12. [Troubleshooting](#troubleshooting)
13. [Development](#development)

---

## Features

| Area | What you can do |
| --- | --- |
| Account | Read account balance and funds required for auto-renewals; query prices for domains, SSL and WhoisGuard |
| Domains | List domains, get details and contacts, check availability (including premium names), read and toggle the registrar (transfer) lock |
| Purchases (opt-in) | Register and renew domains |
| DNS records | List, add, delete or fully replace host records (A, AAAA, ALIAS, CAA, CNAME, MX, MXE, NS, TXT, URL, URL301, FRAME) |
| Nameservers | Read nameservers, point a domain to custom nameservers (e.g. Cloudflare), or switch back to Namecheap DNS |
| Email forwarding | Read and replace email forwarding rules |

## Requirements

- **Node.js 21.7 or newer** (uses the built-in `process.loadEnvFile`).
- A Namecheap account with **API access enabled**. Namecheap only grants API access to accounts that meet its eligibility rules (see their docs).
- A **public IP address** that you can whitelist in Namecheap (the API rejects calls from IPs that are not whitelisted).

---

## 1. Enable the Namecheap API

1. Sign in to Namecheap and open **Profile > Tools > Business & Dev Tools > Namecheap API Access**.
2. Turn API access **ON** and copy your **API key**.
3. Under **Whitelisted IPs**, add the public IP of the machine that will run this server. You can find it with:

   ```bash
   curl https://api.ipify.org
   ```

> **Sandbox:** Namecheap offers a separate sandbox environment at `sandbox.namecheap.com`. It needs its own account and its own API key. Use it to test without touching real domains.

## 2. Install

`npm install` installs the dependencies **and** compiles the TypeScript (via the `prepare` script), so a single command is enough.

### Option A: no clone, run with `npx`

Nothing to install up front. `npx` fetches, builds and caches the server from GitHub the first time it runs. Go straight to the setup wizard:

```bash
npx -y github:CristhianBuiza/mcp-namecheap setup
```

### Option B: clone

```bash
git clone https://github.com/CristhianBuiza/mcp-namecheap.git && cd mcp-namecheap && npm install
npm run setup
```

The compiled entry point is `dist/index.js`.

## 3. Run the setup wizard

MCP servers talk to the client over stdin/stdout, so they cannot stop and ask you questions while running. Instead, a one-time **setup command** asks for each value in your terminal, tests it against the API, and saves it. It is the same for both install options:

```bash
npx -y github:CristhianBuiza/mcp-namecheap setup   # option A
npm run setup                                     # option B, inside the clone
```

What it asks, one question at a time (press Enter to accept the value in brackets):

| Question | Notes |
| --- | --- |
| API username | Your Namecheap API user |
| API key | Typed input is hidden |
| Account username | Defaults to the API username; only differs for reseller setups |
| Whitelisted public IP | `auto` detects it via `api.ipify.org` |
| Use the sandbox API? | `y` for `api.sandbox.namecheap.com` |
| Enable register / renew? | Default **No**; these tools charge your balance |
| Test the connection now? | Calls `getBalances`; if it fails you can fix the values or save anyway |

Example session (placeholders only):

```text
$ npx -y github:CristhianBuiza/mcp-namecheap setup
Namecheap MCP setup

Your answers are saved to ~/.config/mcp-namecheap/config.json (readable only by you).
Get your API key in Namecheap: Profile > Tools > API Access.
Add this machine's public IP to the whitelist on that same page.

API username: YOUR_API_USER
API key (hidden):
Account username [YOUR_API_USER]:
Whitelisted public IP (auto = detect it) [auto]:
Use the sandbox API (api.sandbox.namecheap.com)? (y/N):
Enable register_domain / renew_domain? They charge your balance (y/N):
Test the connection now? (Y/n):
Connected. Available balance: 25.00 USD

Saved to ~/.config/mcp-namecheap/config.json.
```

**Where settings are stored:** `~/.config/mcp-namecheap/config.json` (or `$XDG_CONFIG_HOME/mcp-namecheap/` on Linux, `%APPDATA%\mcp-namecheap\` on Windows). The file is created with permissions `600` and lives **outside the repository**, so it can never be committed. Set `NAMECHEAP_CONFIG_FILE` to use a different path.

**To change a value**, run setup again; current values are offered as defaults and the saved key is kept if you just press Enter.

If the server is started before setup, it still lists its tools, and every tool call returns a message telling the agent to run the setup command.

## 4. Connect it to an MCP client

The wizard prints the exact snippet to paste. For **Cursor**, add it to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project), then reload MCP servers.

Option A (`npx`):

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "npx",
      "args": ["-y", "github:CristhianBuiza/mcp-namecheap"]
    }
  }
}
```

Option B (clone), replacing the path with your clone's location:

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-namecheap/dist/index.js"]
    }
  }
}
```

Claude Desktop, VS Code and other stdio MCP clients use the same shape. No credentials are needed in the client config: the server reads the file saved by setup.

### Quick test with the MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx -y github:CristhianBuiza/mcp-namecheap
```

Call `get_balances` or `list_domains` to confirm the credentials and IP whitelist are correct.

## Advanced: environment variables

Everything the wizard saves can also be provided as environment variables, for example in CI or when you prefer to keep secrets in your client's config. Settings are resolved in this order (first wins):

1. The `env` block of your MCP client config.
2. The file saved by `setup`.
3. A `.env` file in the project root (clone only; copy `.env.example`).

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NAMECHEAP_API_USER` | Yes | | Your Namecheap API username |
| `NAMECHEAP_API_KEY` | Yes | | Your Namecheap API key |
| `NAMECHEAP_USERNAME` | No | value of `NAMECHEAP_API_USER` | Account the commands act on (only differs for reseller setups) |
| `NAMECHEAP_CLIENT_IP` | No | auto-detected | Whitelisted public IP sent with every request. If empty, it is detected once via `api.ipify.org` |
| `NAMECHEAP_SANDBOX` | No | `false` | `true` to use `api.sandbox.namecheap.com` instead of production |
| `NAMECHEAP_ENABLE_PURCHASES` | No | `false` | `true` to allow `register_domain` and `renew_domain`, which **charge your account balance** |
| `NAMECHEAP_CONFIG_FILE` | No | `~/.config/mcp-namecheap/config.json` | Where `setup` saves and the server reads settings |

Boolean variables accept `1`, `true` or `yes` (case-insensitive). Example client config with inline credentials (placeholders only):

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "npx",
      "args": ["-y", "github:CristhianBuiza/mcp-namecheap"],
      "env": {
        "NAMECHEAP_API_USER": "YOUR_API_USER",
        "NAMECHEAP_API_KEY": "YOUR_API_KEY",
        "NAMECHEAP_CLIENT_IP": "YOUR_WHITELISTED_IP"
      }
    }
  }
}
```

Avoid committing a client config that contains real keys.

---

## Tools reference

Legend: **R** = read-only, **W** = modifies data, **$** = charges your balance.

### Account

| Tool | Type | Description |
| --- | --- | --- |
| `get_balances` | R | Account currency, available balance, account balance, earned/withdrawable amounts and funds required for auto-renew |
| `get_pricing` | R | Prices for `DOMAIN`, `SSLCERTIFICATE` or `WHOISGUARD`. Filter by `actionName` (`REGISTER`, `RENEW`, `TRANSFER`, `REACTIVATE`, `PURCHASE`), `productName` (e.g. `com`) and `promotionCode`. Pass a TLD to keep the response small |

### Domains

| Tool | Type | Description |
| --- | --- | --- |
| `list_domains` | R | Paginated domain list. Filters: `listType` (`ALL`, `EXPIRING`, `EXPIRED`), `searchTerm`, `sortBy`, `page`, `pageSize` (10-100) |
| `get_domain_info` | R | Status, dates, DNS provider, WhoisGuard and other details for one domain |
| `check_availability` | R | Availability for up to 50 domains, including premium registration/renewal prices |
| `get_domain_contacts` | R | Registrant, tech, admin and billing contacts |
| `get_registrar_lock` | R | Whether the transfer lock is enabled |
| `set_registrar_lock` | W | Lock or unlock a domain (unlock before transferring it away) |
| `renew_domain` | W $ | Renew for 1-10 years. Requires `NAMECHEAP_ENABLE_PURCHASES=true`. Premium domains need `premiumPrice` |
| `register_domain` | W $ | Register a new domain. Requires `NAMECHEAP_ENABLE_PURCHASES=true`. Takes one `contact` (reused for all roles unless `techContact`, `adminContact` or `billingContact` are given), optional `nameservers`, `whoisPrivacy` (default on), `promotionCode` and `premiumPrice` |

Contact objects use these fields: `firstName`, `lastName`, `address1`, `address2?`, `city`, `stateProvince`, `postalCode`, `country` (ISO 3166-1 alpha-2, e.g. `US`), `phone` (format `+CC.NUMBER`, e.g. `+1.5555550100`), `emailAddress`, `organizationName?`.

### DNS records

These tools only take effect while the domain uses Namecheap's own nameservers. If it does not, the response includes a warning.

| Tool | Type | Description |
| --- | --- | --- |
| `get_dns_records` | R | All host records plus the current mail setting |
| `add_dns_record` | W | Add one record and keep every existing one |
| `delete_dns_record` | W | Delete records matching `hostName` + `recordType` (and `address`, if given); keep the rest |
| `set_dns_records` | W | Replace **all** records with the given list. Anything not included is deleted. Optional `emailType` (`NONE`, `MXE`, `MX`, `FWD`, `OX`, `GMAIL`) |

Record fields: `hostName` (`@` for the root), `recordType`, `address`, `mxPref` (MX only, default 10), `ttl` (60-60000 seconds, default 1800).

### Nameservers

| Tool | Type | Description |
| --- | --- | --- |
| `get_nameservers` | R | Current nameservers and whether Namecheap DNS is in use |
| `set_custom_nameservers` | W | Point the domain to 2-12 custom nameservers. Namecheap DNS records stop applying |
| `set_default_nameservers` | W | Switch back to Namecheap DNS |

### Email forwarding

| Tool | Type | Description |
| --- | --- | --- |
| `get_email_forwarding` | R | Forwarding rules (`mailbox` -> `forwardTo`) |
| `set_email_forwarding` | W | Replace **all** forwarding rules with the given list |

---

## Usage examples

Once connected, ask your agent in plain language. The agent picks the tool and arguments.

- "List my domains that expire in the next month."
- "Is `my-new-idea.com` available, and how much is a `.com` registration?"
- "Add an A record for `app.example.com` pointing to `203.0.113.10`."
- "Add a TXT record `@` with value `v=spf1 include:_spf.example.net ~all` to example.com."
- "Point example.com to the nameservers `ns1.provider.com` and `ns2.provider.com`."
- "Forward `info@example.com` to `team@example.org`."

Example raw tool call (as sent by a client):

```json
{
  "name": "add_dns_record",
  "arguments": {
    "domain": "example.com",
    "record": { "hostName": "www", "recordType": "CNAME", "address": "example.com.", "ttl": 1800 }
  }
}
```

---

## How it works

- Every tool is a thin wrapper around a Namecheap XML API command (for example `namecheap.domains.getList` or `namecheap.domains.dns.setHosts`). Responses are parsed from XML and returned as compact JSON.
- **Safe DNS edits.** Namecheap's `setHosts` replaces the whole record set on every write. `add_dns_record` and `delete_dns_record` therefore read the current records first, apply the change, and write the full set back, so unrelated records are never lost. The mail setting (`EmailType`) is inferred from MX/MXE records so mail routing is not reset by accident.
- **IP handling.** If `NAMECHEAP_CLIENT_IP` is not set, the public IP is detected once per process and reused. When Namecheap reports that the IP is not whitelisted, the error includes a hint with the IP to add.
- **Timeouts.** API calls time out after 60 seconds; IP detection after 10 seconds.

## Security notes

- The setup wizard stores credentials in your user config folder with permissions `600`, outside the repository. If you use `.env` instead, keep it in `.gitignore` (it already is). Never commit a client config that contains a real API key.
- The API key grants full control of the account. Whitelist only the IPs you need and rotate the key if it is ever exposed.
- Leave `NAMECHEAP_ENABLE_PURCHASES=false` unless you actually want the agent to spend money. Even when enabled, the tool descriptions instruct agents to confirm prices with you first.
- Prefer `add_dns_record` / `delete_dns_record` over `set_dns_records`, which deletes anything you do not include.
- Test risky workflows against the sandbox (`NAMECHEAP_SANDBOX=true`) first.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Namecheap is not configured yet` | Run `npx -y github:CristhianBuiza/mcp-namecheap setup` (or `npm run setup` in a clone), then reload the MCP server |
| Setup's connection test fails | Check the API key, that API access is ON, and that the IP shown is whitelisted; then re-run setup |
| Error `1011150` / invalid request IP | Whitelist the IP shown in the hint under **API Access**, or set `NAMECHEAP_CLIENT_IP` to an already whitelisted IP |
| `Could not auto-detect public IP` | The machine cannot reach `api.ipify.org`; set `NAMECHEAP_CLIENT_IP` explicitly |
| `Purchases are disabled` | Set `NAMECHEAP_ENABLE_PURCHASES=true` (only if you intend to register or renew) |
| DNS changes have no effect | The domain uses custom nameservers. Edit DNS at that provider, or run `set_default_nameservers` |
| Authentication errors in sandbox | Sandbox needs its own account and API key, separate from production |

## Development

```bash
npm install       # install dependencies and build (runs the prepare script)
npm run build     # recompile TypeScript to dist/ after changes
npm run setup     # guided configuration
npm start         # run the server on stdio
```

Project layout:

```text
.env.example        # settings template for the .env alternative
package.json        # scripts: build, prepare (build on install), setup, start
src/
  index.ts          # entry point: "setup" command, loads settings, registers tools, starts stdio
  setup.ts          # guided setup wizard (asks, tests, saves)
  settings.ts       # saved settings file: location, read/write, apply to env
  prompt.ts         # terminal prompts (hidden input for secrets)
  client.ts         # Namecheap XML API client, error handling, helpers
  result.ts         # wraps tool results/errors in MCP content
  tools/
    account.ts      # get_balances, get_pricing
    domains.ts      # domain listing, info, availability, lock, register, renew
    dns.ts          # DNS records, nameservers, email forwarding
```

Built with [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk), [`zod`](https://zod.dev) for input schemas and [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser).

To add a tool, register it in the relevant file under `src/tools/` with `server.registerTool`, call the Namecheap command through `NamecheapClient.call`, and set accurate `readOnlyHint` / `destructiveHint` annotations.

## Disclaimer

This is an independent project and is not affiliated with or endorsed by Namecheap, Inc. Use it at your own risk; review what your agent is about to do, especially for write and purchase operations.
