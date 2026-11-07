import { XMLParser } from "fast-xml-parser";

export interface NamecheapConfig {
  apiUser: string;
  apiKey: string;
  userName: string;
  clientIp?: string;
  sandbox: boolean;
}

export class NamecheapApiError extends Error {
  constructor(
    public readonly command: string,
    public readonly errors: { number: string; message: string }[],
  ) {
    super(
      `Namecheap ${command} failed: ` +
        errors.map((e) => `[${e.number}] ${e.message}`).join("; "),
    );
    this.name = "NamecheapApiError";
  }
}

const ARRAY_TAGS = new Set([
  "Error",
  "Warning",
  "Domain",
  "DomainCheckResult",
  "host",
  "Nameserver",
  "forward",
  "Tld",
  "ProductType",
  "ProductCategory",
  "Product",
  "Price",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  textNodeName: "#text",
  isArray: (name, _jPath, _isLeaf, isAttribute) =>
    !isAttribute && ARRAY_TAGS.has(name),
});

export type Params = Record<string, string | number | boolean | undefined>;

export class NamecheapClient {
  private clientIp: string | undefined;

  constructor(private readonly config: NamecheapConfig) {
    this.clientIp = config.clientIp;
  }

  get endpoint(): string {
    return this.config.sandbox
      ? "https://api.sandbox.namecheap.com/xml.response"
      : "https://api.namecheap.com/xml.response";
  }

  private async resolveClientIp(): Promise<string> {
    if (this.clientIp) return this.clientIp;
    const res = await fetch("https://api.ipify.org", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(
        "Could not auto-detect public IP; set NAMECHEAP_CLIENT_IP explicitly.",
      );
    }
    this.clientIp = (await res.text()).trim();
    return this.clientIp;
  }

  async call(command: string, params: Params = {}): Promise<any> {
    const body = new URLSearchParams({
      ApiUser: this.config.apiUser,
      ApiKey: this.config.apiKey,
      UserName: this.config.userName,
      ClientIp: await this.resolveClientIp(),
      Command: command,
    });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, String(value));
    }

    const res = await fetch(this.endpoint, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Namecheap HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const api = parser.parse(text)?.ApiResponse;
    if (!api) {
      throw new Error(`Unexpected Namecheap response: ${text.slice(0, 500)}`);
    }
    if (api.Status !== "OK") {
      const errors = (api.Errors?.Error ?? []).map((e: any) => ({
        number: String(e?.Number ?? "?"),
        message: String(e?.["#text"] ?? e ?? "Unknown error"),
      }));
      if (errors.length === 0) {
        errors.push({ number: "?", message: `Status ${api.Status}` });
      }
      if (errors.some((e: { number: string }) => e.number === "1011150")) {
        errors.push({
          number: "hint",
          message: `Whitelist IP ${this.clientIp} in Namecheap > Profile > Tools > API Access.`,
        });
      }
      throw new NamecheapApiError(command, errors);
    }
    return api.CommandResponse;
  }
}

export function splitDomain(domain: string): { SLD: string; TLD: string } {
  const clean = domain.trim().toLowerCase().replace(/\.$/, "");
  const dot = clean.indexOf(".");
  if (dot <= 0 || dot === clean.length - 1) {
    throw new Error(`Invalid domain "${domain}". Expected e.g. example.com`);
  }
  return { SLD: clean.slice(0, dot), TLD: clean.slice(dot + 1) };
}

export function toBool(value: unknown): boolean {
  return String(value).toLowerCase() === "true";
}
