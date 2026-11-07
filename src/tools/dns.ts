import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { splitDomain, toBool, type NamecheapClient, type Params } from "../client.js";
import { run } from "../result.js";

const domain = z.string().describe("Domain name, e.g. example.com");

const RECORD_TYPES = [
  "A", "AAAA", "ALIAS", "CAA", "CNAME", "MX", "MXE", "NS", "TXT", "URL", "URL301", "FRAME",
] as const;

const EMAIL_TYPES = ["NONE", "MXE", "MX", "FWD", "OX", "GMAIL"] as const;

const recordSchema = z.object({
  hostName: z.string().describe('Subdomain, or "@" for the root domain'),
  recordType: z.enum(RECORD_TYPES),
  address: z
    .string()
    .describe('Record value. For CAA use e.g. 0 issue "letsencrypt.org"'),
  mxPref: z.number().int().min(0).optional().describe("MX priority (MX records only)"),
  ttl: z.number().int().min(60).max(60000).optional().describe("Seconds, default 1800"),
});

type HostRecord = z.infer<typeof recordSchema>;

interface HostsState {
  domain: string;
  emailType?: string;
  usesNamecheapDns: boolean;
  records: HostRecord[];
}

async function getHosts(client: NamecheapClient, name: string): Promise<HostsState> {
  const res = await client.call("namecheap.domains.dns.getHosts", splitDomain(name));
  const r = res.DomainDNSGetHostsResult ?? {};
  return {
    domain: r.Domain ?? name,
    emailType: r.EmailType || undefined,
    usesNamecheapDns: toBool(r.IsUsingOurDNS),
    records: (r.host ?? []).map((h: any) => ({
      hostName: h.Name,
      recordType: h.Type,
      address: h.Address,
      ...(h.Type === "MX" && { mxPref: Number(h.MXPref) }),
      ttl: Number(h.TTL),
    })),
  };
}

function resolveEmailType(records: HostRecord[], current?: string): string | undefined {
  if (records.some((r) => r.recordType === "MX")) return "MX";
  if (records.some((r) => r.recordType === "MXE")) return "MXE";
  if (current === "MX" || current === "MXE") return undefined;
  return current;
}

async function setHosts(
  client: NamecheapClient,
  name: string,
  records: HostRecord[],
  emailType?: string,
) {
  const params: Params = { ...splitDomain(name), EmailType: emailType };
  records.forEach((r, i) => {
    const n = i + 1;
    params[`HostName${n}`] = r.hostName;
    params[`RecordType${n}`] = r.recordType;
    params[`Address${n}`] = r.address;
    params[`TTL${n}`] = r.ttl ?? 1800;
    if (r.recordType === "MX") params[`MXPref${n}`] = r.mxPref ?? 10;
  });
  const res = await client.call("namecheap.domains.dns.setHosts", params);
  const r = res.DomainDNSSetHostsResult;
  if (!toBool(r?.IsSuccess)) throw new Error("Namecheap did not confirm the DNS update.");
}

const NOT_OUR_DNS_WARNING =
  "Domain is not using Namecheap DNS; these records have no effect until nameservers are set to default.";

export function registerDnsTools(server: McpServer, getClient: () => NamecheapClient) {
  server.registerTool(
    "get_dns_records",
    {
      title: "Get DNS records",
      description: "List DNS host records for a domain using Namecheap DNS.",
      inputSchema: { domain },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ domain }) =>
      run(async () => {
        const state = await getHosts(getClient(), domain);
        return {
          ...state,
          ...(!state.usesNamecheapDns && { warning: NOT_OUR_DNS_WARNING }),
        };
      }),
  );

  server.registerTool(
    "add_dns_record",
    {
      title: "Add DNS record",
      description:
        "Add a DNS record while keeping all existing records (Namecheap's API replaces the whole set on every write).",
      inputSchema: { domain, record: recordSchema },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ domain, record }) =>
      run(async () => {
        const client = getClient();
        const state = await getHosts(client, domain);
        const records = [...state.records, record];
        await setHosts(client, domain, records, resolveEmailType(records, state.emailType));
        return {
          added: record,
          totalRecords: records.length,
          ...(!state.usesNamecheapDns && { warning: NOT_OUR_DNS_WARNING }),
        };
      }),
  );

  server.registerTool(
    "delete_dns_record",
    {
      title: "Delete DNS record",
      description:
        "Delete DNS records matching host name and type (and address, if given), keeping all other records.",
      inputSchema: {
        domain,
        hostName: z.string().describe('Subdomain, or "@" for the root domain'),
        recordType: z.enum(RECORD_TYPES),
        address: z
          .string()
          .optional()
          .describe("Only delete the record with this exact value"),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ domain, hostName, recordType, address }) =>
      run(async () => {
        const client = getClient();
        const state = await getHosts(client, domain);
        const matches = (r: HostRecord) =>
          r.hostName.toLowerCase() === hostName.toLowerCase() &&
          r.recordType === recordType &&
          (address === undefined || r.address === address);
        const removed = state.records.filter(matches);
        if (removed.length === 0) {
          throw new Error(`No ${recordType} record found for "${hostName}" on ${domain}.`);
        }
        const records = state.records.filter((r) => !matches(r));
        await setHosts(client, domain, records, resolveEmailType(records, state.emailType));
        return { removed, totalRecords: records.length };
      }),
  );

  server.registerTool(
    "set_dns_records",
    {
      title: "Replace all DNS records",
      description:
        "Replace ALL DNS host records for a domain with the given list. Records not included are deleted. Prefer add_dns_record/delete_dns_record for single changes.",
      inputSchema: {
        domain,
        records: z.array(recordSchema),
        emailType: z
          .enum(EMAIL_TYPES)
          .optional()
          .describe("Mail setting; inferred from MX/MXE records if omitted"),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ domain, records, emailType }) =>
      run(async () => {
        const client = getClient();
        const current = await getHosts(client, domain);
        await setHosts(
          client,
          domain,
          records,
          emailType ?? resolveEmailType(records, current.emailType),
        );
        return { previous: current.records, totalRecords: records.length };
      }),
  );

  server.registerTool(
    "get_nameservers",
    {
      title: "Get nameservers",
      description: "Get the nameservers a domain is using.",
      inputSchema: { domain },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ domain }) =>
      run(async () => {
        const res = await getClient().call(
          "namecheap.domains.dns.getList",
          splitDomain(domain),
        );
        const r = res.DomainDNSGetListResult ?? {};
        return {
          domain: r.Domain ?? domain,
          usesNamecheapDns: toBool(r.IsUsingOurDNS),
          nameservers: (r.Nameserver ?? []).map(String),
        };
      }),
  );

  server.registerTool(
    "set_custom_nameservers",
    {
      title: "Set custom nameservers",
      description:
        "Point a domain to custom nameservers (e.g. Cloudflare). Namecheap DNS records stop applying.",
      inputSchema: {
        domain,
        nameservers: z.array(z.string()).min(2).max(12),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ domain, nameservers }) =>
      run(async () => {
        const res = await getClient().call("namecheap.domains.dns.setCustom", {
          ...splitDomain(domain),
          Nameservers: nameservers.join(","),
        });
        return { updated: toBool(res.DomainDNSSetCustomResult?.Updated), nameservers };
      }),
  );

  server.registerTool(
    "set_default_nameservers",
    {
      title: "Use Namecheap nameservers",
      description: "Switch a domain back to Namecheap's default DNS nameservers.",
      inputSchema: { domain },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ domain }) =>
      run(async () => {
        const res = await getClient().call(
          "namecheap.domains.dns.setDefault",
          splitDomain(domain),
        );
        return { updated: toBool(res.DomainDNSSetDefaultResult?.Updated) };
      }),
  );

  server.registerTool(
    "get_email_forwarding",
    {
      title: "Get email forwarding",
      description: "List email forwarding rules for a domain.",
      inputSchema: { domain },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ domain }) =>
      run(async () => {
        const res = await getClient().call("namecheap.domains.dns.getEmailForwarding", {
          DomainName: domain,
        });
        const r = res.DomainDNSGetEmailForwardingResult ?? {};
        return {
          domain: r.Domain ?? domain,
          forwards: (r.forward ?? []).map((f: any) => ({
            mailbox: f.mailbox,
            forwardTo: f["#text"],
          })),
        };
      }),
  );

  server.registerTool(
    "set_email_forwarding",
    {
      title: "Set email forwarding",
      description:
        "Replace ALL email forwarding rules for a domain. Rules not included are deleted.",
      inputSchema: {
        domain,
        forwards: z
          .array(
            z.object({
              mailbox: z.string().describe('Local part, e.g. "info" for info@domain'),
              forwardTo: z.string().email(),
            }),
          )
          .min(1),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ domain, forwards }) =>
      run(async () => {
        const params: Params = { DomainName: domain };
        forwards.forEach((f, i) => {
          params[`MailBox${i + 1}`] = f.mailbox;
          params[`ForwardTo${i + 1}`] = f.forwardTo;
        });
        const res = await getClient().call("namecheap.domains.dns.setEmailForwarding", params);
        return { success: toBool(res.DomainEmailForwardingResult?.IsSuccess), forwards };
      }),
  );
}
