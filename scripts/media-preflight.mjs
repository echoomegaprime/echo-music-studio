import { pathToFileURL } from "node:url";
import { creditResult } from "../src/lib/suno/credit-result.mjs";

const sunoRoot = "https://api.sunoapi.org";
const elevenRoot = "https://api.elevenlabs.io";

function publicFailure(status) {
  if (status === 401 || status === 403) return "authorization_denied";
  if (status === 402) return "payment_required";
  if (status === 429) return "rate_limited";
  return "provider_unavailable";
}

async function readJson(fetchImpl, url, headers) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { state: publicFailure(response.status) };
    return { state: "ok", data: await response.json() };
  } catch {
    return { state: "read_failed" };
  }
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

async function sunoBalance(env, fetchImpl) {
  if (!env.SUNO_API_KEY?.trim()) return { state: "credential_missing" };
  const root = (env.SUNO_API_BASE?.trim() || sunoRoot).replace(/\/+$/, "");
  // Never forward a platform credential to a different origin or redirect.
  if (root !== sunoRoot) return { state: "custom_provider_unverified" };
  const read = await readJson(fetchImpl, sunoRoot + "/api/v1/generate/credit", {
    Authorization: "Bearer " + env.SUNO_API_KEY.trim(),
  });
  if (read.state !== "ok") return { state: read.state };
  return creditResult(read.data);
}

async function narration(env, fetchImpl) {
  if (!env.ELEVENLABS_API_KEY?.trim()) return { state: "credential_missing" };
  const headers = { "xi-api-key": env.ELEVENLABS_API_KEY.trim() };
  const account = await readJson(fetchImpl, elevenRoot + "/v1/user", headers);
  if (account.state !== "ok") return { state: account.state };
  const subscription = account.data?.subscription;
  if (!subscription || typeof subscription.status !== "string") return { state: "entitlement_unverified" };
  if (!["free", "active", "trialing"].includes(subscription.status)) return { state: "entitlement_unverified" };
  if (!count(subscription.character_count) || !count(subscription.character_limit)) return { state: "quota_unverified" };
  const includedCharactersLeft = Math.max(0, subscription.character_limit - subscription.character_count);
  if (includedCharactersLeft === 0) return { state: "included_quota_exhausted", includedCharactersLeft };
  const voiceId = env.ECHO_NARRATION_VOICE_ID?.trim();
  if (!voiceId) return { state: "select_voice", includedCharactersLeft };
  const catalog = await readJson(fetchImpl, elevenRoot + "/v1/voices", headers);
  if (catalog.state !== "ok") return { state: catalog.state, includedCharactersLeft };
  if (!Array.isArray(catalog.data?.voices)) return { state: "voice_unverified", includedCharactersLeft };
  const visible = catalog.data.voices.some((voice) => voice?.voice_id === voiceId);
  return { state: visible ? "voice_and_quota_visible" : "voice_not_listed", includedCharactersLeft };
}

export async function mediaPreflight(env, fetchImpl = fetch) {
  const [suno, elevenlabs] = await Promise.all([sunoBalance(env, fetchImpl), narration(env, fetchImpl)]);
  return { suno, elevenlabs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await mediaPreflight(process.env);
  console.log(JSON.stringify(result, null, 2));
  if (result.suno.state !== "balance_available" || result.elevenlabs.state !== "voice_and_quota_visible") {
    process.exitCode = 1;
  }
}
