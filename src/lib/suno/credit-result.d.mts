export function creditResult(body: unknown):
  | { state: "balance_available" | "no_credits"; credits: number }
  | { state: "authorization_denied" | "payment_required" | "rate_limited" | "balance_unverified" };
