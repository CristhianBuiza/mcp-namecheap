# mcp-namecheap

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for the [Namecheap API](https://www.namecheap.com/support/api/intro/). It lets AI agents and any MCP-compatible client (Cursor, Claude Desktop, VS Code, custom agents, etc.) manage domains, DNS records, nameservers, email forwarding and pricing in a Namecheap account.

- Runs locally over **stdio**; no extra service to host.
- Credentials stay on your machine (environment variables or a local `.env`).
- Purchases (register / renew) are **disabled by default** and must be explicitly enabled.
- Tools carry MCP annotations (`readOnlyHint`, `destructiveHint`) so clients can ask for confirmation before risky actions.

---

## Table of contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Enable the Namecheap API](#1-enable-the-namecheap-api)
4. [Install and build](#2-install-and-build)
5. [Configuration](#3-configuration)
6. [Connect it to an MCP client](#4-connect-it-to-an-mcp-client)
7. [Tools reference](#tools-reference)
8. [Usage examples](#usage-examples)
9. [How it works](#how-it-works)
10. [Security notes](#security-notes)
11. [Troubleshooting](#troubleshooting)
12. [Development](#development)

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

## 2. Install and build

```bash
git clone https://github.com/YOUR_GITHUB_USER/mcp-namecheap.git
cd mcp-namecheap
npm install
npm run build
```

The compiled entry point is `dist/index.js`.

## 3. Configuration

The server reads its settings from environment variables. You can provide them in either of two ways:

- **A `.env` file** in the project root (next to `package.json`). Copy the template and fill it in:

  ```bash
  cp .env.example .env
  ```

- **The `env` block of your MCP client config** (see the next section). Values set there take precedence over nothing else being loaded, and are the easiest option when you run the server from a shared location.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NAMECHEAP_API_USER` | Yes | | Your Namecheap API username |
| `NAMECHEAP_API_KEY` | Yes | | Your Namecheap API key |
| `NAMECHEAP_USERNAME` | No | value of `NAMECHEAP_API_USER` | Account the commands act on (only differs for reseller setups) |
| `NAMECHEAP_CLIENT_IP` | No | auto-detected | Whitelisted public IP sent with every request. If empty, it is detected once via `api.ipify.org` |
| `NAMECHEAP_SANDBOX` | No | `false` | `true` to use `api.sandbox.namecheap.com` instead of production |
| `NAMECHEAP_ENABLE_PURCHASES` | No | `false` | `true` to allow `register_domain` and `renew_domain`, which **charge your account balance** |

Example `.env` (placeholders only):

```dotenv
NAMECHEAP_API_USER=YOUR_API_USER
NAMECHEAP_API_KEY=YOUR_API_KEY
NAMECHEAP_USERNAME=
NAMECHEAP_CLIENT_IP=YOUR_WHITELISTED_IP
NAMECHEAP_SANDBOX=false
NAMECHEAP_ENABLE_PURCHASES=false
```

Boolean variables accept `1`, `true` or `yes` (case-insensitive).

Credentials are only read when the first tool is called, so the server starts (and lists its tools) even before you configure it.

## 4. Connect it to an MCP client

Any client that can launch a stdio MCP server works. Replace `/ABSOLUTE/PATH/TO/mcp-namecheap` with the folder where you cloned the repo.

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project):

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

### Claude Desktop, VS Code and other clients

Same shape. If you prefer not to keep a `.env` file, pass the credentials through `env`:

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-namecheap/dist/index.js"],
      "env": {
        "NAMECHEAP_API_USER": "YOUR_API_USER",
        "NAMECHEAP_API_KEY": "YOUR_API_KEY",
        "NAMECHEAP_CLIENT_IP": "YOUR_WHITELISTED_IP"
      }
    }
  }
}
```

Avoid committing a client config that contains real keys. Most clients also support variable interpolation (for example `"${env:NAMECHEAP_API_KEY}"`); check your client's docs.

### Quick test with the MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Call `get_balances` or `list_domains` to confirm the credentials and IP whitelist are correct.

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

- Never commit `.env` or a client config that contains a real API key. Keep `.env` in `.gitignore`.
- The API key grants full control of the account. Whitelist only the IPs you need and rotate the key if it is ever exposed.
- Leave `NAMECHEAP_ENABLE_PURCHASES=false` unless you actually want the agent to spend money. Even when enabled, the tool descriptions instruct agents to confirm prices with you first.
- Prefer `add_dns_record` / `delete_dns_record` over `set_dns_records`, which deletes anything you do not include.
- Test risky workflows against the sandbox (`NAMECHEAP_SANDBOX=true`) first.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing NAMECHEAP_API_USER / NAMECHEAP_API_KEY` | Set both variables in `.env` or in the client's `env` block, then restart the server |
| Error `1011150` / invalid request IP | Whitelist the IP shown in the hint under **API Access**, or set `NAMECHEAP_CLIENT_IP` to an already whitelisted IP |
| `Could not auto-detect public IP` | The machine cannot reach `api.ipify.org`; set `NAMECHEAP_CLIENT_IP` explicitly |
| `Purchases are disabled` | Set `NAMECHEAP_ENABLE_PURCHASES=true` (only if you intend to register or renew) |
| DNS changes have no effect | The domain uses custom nameservers. Edit DNS at that provider, or run `set_default_nameservers` |
| Authentication errors in sandbox | Sandbox needs its own account and API key, separate from production |

## Development

```bash
npm install
npm run build     # compile TypeScript to dist/
npm start         # run the server on stdio
```

Project layout:

```text
src/
  index.ts          # entry point: loads config, registers tools, starts stdio transport
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
