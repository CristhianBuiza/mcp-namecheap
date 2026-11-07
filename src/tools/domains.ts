import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toBool, type NamecheapClient, type Params } from "../client.js";
import { run } from "../result.js";

const domain = z.string().describe("Domain name, e.g. example.com");

const contactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  address1: z.string(),
  address2: z.string().optional(),
  city: z.string(),
  stateProvince: z.string(),
  postalCode: z.string(),
  country: z.string().length(2).describe("ISO 3166-1 alpha-2 code, e.g. US"),
  phone: z.string().describe("Format +NNN.NNNNNNNNNN, e.g. +1.6613102107"),
  emailAddress: z.string().email(),
  organizationName: z.string().optional(),
});

type Contact = z.infer<typeof contactSchema>;

function contactParams(prefix: string, c: Contact): Params {
  return {
    [`${prefix}FirstName`]: c.firstName,
    [`${prefix}LastName`]: c.lastName,
    [`${prefix}Address1`]: c.address1,
    [`${prefix}Address2`]: c.address2,
    [`${prefix}City`]: c.city,
    [`${prefix}StateProvince`]: c.stateProvince,
    [`${prefix}PostalCode`]: c.postalCode,
    [`${prefix}Country`]: c.country.toUpperCase(),
    [`${prefix}Phone`]: c.phone,
    [`${prefix}EmailAddress`]: c.emailAddress,
    [`${prefix}OrganizationName`]: c.organizationName,
  };
}

export function registerDomainTools(
  server: McpServer,
  getClient: () => NamecheapClient,
  allowPurchases: boolean,
) {
  const requirePurchases = () => {
    if (!allowPurchases) {
      throw new Error(
        "Purchases are disabled. Set NAMECHEAP_ENABLE_PURCHASES=true to allow registering or renewing domains.",
      );
    }
  };

  server.registerTool(
    "list_domains",
    {
      title: "List domains",
      description: "List domains in the Namecheap account.",
      inputSchema: {
        listType: z.enum(["ALL", "EXPIRING", "EXPIRED"]).default("ALL"),
        searchTerm: z.string().optional().describe("Filter by keyword"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(100),
        sortBy: z
          .enum(["NAME", "NAME_DESC", "EXPIREDATE", "EXPIREDATE_DESC", "CREATEDATE", "CREATEDATE_DESC"])
          .optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ listType, searchTerm, page, pageSize, sortBy }) =>
      run(async () => {
        const res = await getClient().call("namecheap.domains.getList", {
          ListType: listType,
          SearchTerm: searchTerm,
          Page: page,
          PageSize: pageSize,
          SortBy: sortBy,
        });
        const domains = (res.DomainGetListResult?.Domain ?? []).map((d: any) => ({
          name: d.Name,
          created: d.Created,
          expires: d.Expires,
          isExpired: toBool(d.IsExpired),
          isLocked: toBool(d.IsLocked),
          autoRenew: toBool(d.AutoRenew),
          whoisGuard: d.WhoisGuard,
          isPremium: toBool(d.IsPremium),
          usesNamecheapDns: toBool(d.IsOurDNS),
        }));
        return {
          totalItems: Number(res.Paging?.TotalItems ?? domains.length),
          currentPage: Number(res.Paging?.CurrentPage ?? page),
          pageSize: Number(res.Paging?.PageSize ?? pageSize),
          domains,
        };
      }),
  );

  server.registerTool(
    "get_domain_info",
    {
      title: "Get domain info",
      description:
        "Get details for a domain in the account: status, dates, DNS provider, WhoisGuard, etc.",
      inputSchema: { domain },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ domain }) =>
      run(async () => {
        const res = await getClient().call("namecheap.domains.getInfo", {
          DomainName: domain,
        });
        return res.DomainGetInfoResult;
      }),
  );

  server.registerTool(
    "check_availability",
    {
      title: "Check domain availability",
      description:
        "Check whether one or more domains are available to register, including premium pricing.",
      inputSchema: {
        domains: z.array(z.string()).min(1).max(50).describe("Domains to check"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ domains }) =>
      run(async () => {
        const res = await getClient().call("namecheap.domains.check", {
          DomainList: domains.join(","),
        });
        return (res.DomainCheckResult ?? []).map((r: any) => ({
          domain: r.Domain,
          available: toBool(r.Available),
          isPremium: toBool(r.IsPremiumName),
          ...(toBool(r.IsPremiumName) && {
            premiumRegistrationPrice: r.PremiumRegistrationPrice,
            premiumRenewalPrice: r.PremiumRenewalPrice,
          }),
          ...(r.ErrorNo && r.ErrorNo !== "0" && { error: r.Description }),
        }));
      }),
  );

  server.registerTool(
    "get_domain_contacts",
    {
      title: "Get domain contacts",
      description: "Get registrant, tech, admin and billing contacts for a domain.",
      inputSchema: { domain },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ domain }) =>
      run(async () => {
        const res = await getClient().call("namecheap.domains.getContacts", {
          DomainName: domain,
        });
        return res.DomainContactsResult;
      }),
  );

  server.registerTool(
    "get_registrar_lock",
    {
      title: "Get registrar lock",
      description: "Check whether a domain's registrar (transfer) lock is enabled.",
      inputSchema: { domain },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ domain }) =>
      run(async () => {
        const res = await getClient().call("namecheap.domains.getRegistrarLock", {
          DomainName: domain,
        });
        const r = res.DomainGetRegistrarLockResult;
        return { domain: r?.Domain, locked: toBool(r?.RegistrarLockStatus) };
      }),
  );

  server.registerTool(
    "set_registrar_lock",
    {
      title: "Set registrar lock",
      description:
        "Enable or disable a domain's registrar lock. Unlocking is required before transferring the domain away.",
      inputSchema: { domain, locked: z.boolean() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ domain, locked }) =>
      run(async () => {
        const res = await getClient().call("namecheap.domains.setRegistrarLock", {
          DomainName: domain,
          LockAction: locked ? "LOCK" : "UNLOCK",
        });
        const r = res.DomainSetRegistrarLockResult;
        return { domain: r?.Domain, success: toBool(r?.IsSuccess), locked };
      }),
  );

  server.registerTool(
    "renew_domain",
    {
      title: "Renew domain",
      description:
        "Renew a domain. CHARGES the account balance. Requires NAMECHEAP_ENABLE_PURCHASES=true. Confirm with the user before calling.",
      inputSchema: {
        domain,
        years: z.number().int().min(1).max(10).default(1),
        promotionCode: z.string().optional(),
        premiumPrice: z
          .number()
          .optional()
          .describe("Required for premium domains: the premium renewal price"),
      },
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    ({ domain, years, promotionCode, premiumPrice }) =>
      run(async () => {
        requirePurchases();
        const res = await getClient().call("namecheap.domains.renew", {
          DomainName: domain,
          Years: years,
          PromotionCode: promotionCode,
          IsPremiumDomain: premiumPrice !== undefined ? "true" : undefined,
          PremiumPrice: premiumPrice,
        });
        return res.DomainRenewResult;
      }),
  );

  server.registerTool(
    "register_domain",
    {
      title: "Register domain",
      description:
        "Register a new domain. CHARGES the account balance. Requires NAMECHEAP_ENABLE_PURCHASES=true. Check availability and confirm price with the user before calling.",
      inputSchema: {
        domain,
        years: z.number().int().min(1).max(10).default(1),
        contact: contactSchema.describe(
          "Used for registrant, tech, admin and billing unless overridden",
        ),
        techContact: contactSchema.optional(),
        adminContact: contactSchema.optional(),
        billingContact: contactSchema.optional(),
        nameservers: z
          .array(z.string())
          .optional()
          .describe("Custom nameservers; omit to use Namecheap DNS"),
        whoisPrivacy: z.boolean().default(true),
        promotionCode: z.string().optional(),
        premiumPrice: z
          .number()
          .optional()
          .describe("Required for premium domains: the premium registration price"),
      },
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    (args) =>
      run(async () => {
        requirePurchases();
        const res = await getClient().call("namecheap.domains.create", {
          DomainName: args.domain,
          Years: args.years,
          PromotionCode: args.promotionCode,
          Nameservers: args.nameservers?.join(","),
          AddFreeWhoisguard: args.whoisPrivacy ? "yes" : "no",
          WGEnabled: args.whoisPrivacy ? "yes" : "no",
          IsPremiumDomain: args.premiumPrice !== undefined ? "true" : undefined,
          PremiumPrice: args.premiumPrice,
          ...contactParams("Registrant", args.contact),
          ...contactParams("Tech", args.techContact ?? args.contact),
          ...contactParams("Admin", args.adminContact ?? args.contact),
          ...contactParams("AuxBilling", args.billingContact ?? args.contact),
        });
        return res.DomainCreateResult;
      }),
  );
}
