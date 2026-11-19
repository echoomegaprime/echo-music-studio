export function creditResult(body) {
  if (body?.code !== 200) {
    const code = body?.code;
    if (code === 401 || code === 403) return { state: "authorization_denied" };
    if (code === 402) return { state: "payment_required" };
    if (code === 429) return { state: "rate_limited" };
    return { state: "balance_unverified" };
  }
  const credits = typeof body.data === "number" ? body.data : body.data?.credits ?? body.data?.credit;
  if (!Number.isSafeInteger(credits) || credits < 0) return { state: "balance_unverified" };
  return { state: credits > 0 ? "balance_available" : "no_credits", credits };
}
