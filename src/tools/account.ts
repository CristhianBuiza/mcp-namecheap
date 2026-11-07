import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NamecheapClient } from "../client.js";
import { run } from "../result.js";

export function registerAccountTools(server: McpServer, getClient: () => NamecheapClient) {
  server.registerTool(
    "get_balances",
    {
      title: "Get account balance",
      description: "Get the Namecheap account balance and funds needed for auto-renewals.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    () =>
      run(async () => {
        const res = await getClient().call("namecheap.users.getBalances");
        const r = res.UserGetBalancesResult ?? {};
        return {
          currency: r.Currency,
          availableBalance: r.AvailableBalance,
          accountBalance: r.AccountBalance,
          earnedAmount: r.EarnedAmount,
          withdrawableAmount: r.WithdrawableAmount,
          fundsRequiredForAutoRenew: r.FundsRequiredForAutoRenew,
        };
      }),
  );

  server.registerTool(
    "get_pricing",
    {
      title: "Get pricing",
      description:
        "Get Namecheap prices. For domains, pass a TLD in productName (e.g. com) to keep the response small.",
      inputSchema: {
        productType: z.enum(["DOMAIN", "SSLCERTIFICATE", "WHOISGUARD"]).default("DOMAIN"),
        actionName: z
          .enum(["REGISTER", "RENEW", "TRANSFER", "REACTIVATE", "PURCHASE"])
          .optional(),
        productName: z.string().optional().describe("e.g. com, net, io"),
        promotionCode: z.string().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ productType, actionName, productName, promotionCode }) =>
      run(async () => {
        const res = await getClient().call("namecheap.users.getPricing", {
          ProductType: productType,
          ActionName: actionName,
          ProductName: productName?.replace(/^\./, "").toUpperCase(),
          PromotionCode: promotionCode,
        });
        const rows: Record<string, unknown>[] = [];
        for (const type of res.UserGetPricingResult?.ProductType ?? []) {
          for (const category of type.ProductCategory ?? []) {
            for (const product of category.Product ?? []) {
              for (const price of product.Price ?? []) {
                rows.push({
                  action: category.Name,
                  product: product.Name,
                  duration: `${price.Duration} ${price.DurationType}`,
                  yourPrice: price.YourPrice,
                  regularPrice: price.RegularPrice,
                  additionalCost: price.YourAdditonalCost ?? price.AdditionalCost,
                  currency: price.Currency,
                });
              }
            }
          }
        }
        return rows;
      }),
  );
}
