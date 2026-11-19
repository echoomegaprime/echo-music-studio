import test from "node:test";
import assert from "node:assert/strict";
import { mediaPreflight } from "./media-preflight.mjs";

const env = { SUNO_API_KEY: "suno-fixture-secret", ELEVENLABS_API_KEY: "eleven-fixture-secret", ECHO_NARRATION_VOICE_ID: "fixture-voice" };
const suno = "https://api.sunoapi.org/api/v1/generate/credit";
const user = "https://api.elevenlabs.io/v1/user";
const voices = "https://api.elevenlabs.io/v1/voices";
const account = { subscription: { status: "active", character_count: 12, character_limit: 50 } };

function fixture(routes) {
  const called = [];
  const fetchImpl = async (url, init) => {
    called.push(url);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal);
    assert.deepEqual(init.headers, url === suno ? { Authorization: "Bearer " + env.SUNO_API_KEY } : { "xi-api-key": env.ELEVENLABS_API_KEY });
    const item = routes[url];
    if (!item) throw Error("Unexpected read");
    return Response.json(item.data, { status: item.status ?? 200 });
  };
  return { called, fetchImpl };
}

test("positive balance and selected voice are verified through only three GET routes", async () => {
  const f = fixture({ [suno]: { data: { code: 200, data: 5 } }, [user]: { data: account }, [voices]: { data: { voices: [{ voice_id: "fixture-voice" }] } } });
  assert.deepEqual(await mediaPreflight(env, f.fetchImpl), { suno: { state: "balance_available", credits: 5 }, elevenlabs: { state: "voice_and_quota_visible", includedCharactersLeft: 38 } });
  assert.deepEqual(f.called.sort(), [suno, user, voices].sort());
});

test("missing credentials and unsupported custom host make zero network requests", async () => {
  const f = fixture({});
  assert.deepEqual(await mediaPreflight({}, f.fetchImpl), { suno: { state: "credential_missing" }, elevenlabs: { state: "credential_missing" } });
  assert.equal((await mediaPreflight({ SUNO_API_KEY: "configured", SUNO_API_BASE: "https://fixture.invalid" }, f.fetchImpl)).suno.state, "custom_provider_unverified");
  assert.deepEqual(f.called, []);
});

test("authorization and payment errors are redacted and never retried", async () => {
  const f = fixture({ [suno]: { data: { code: 401, msg: env.SUNO_API_KEY } }, [user]: { status: 402, data: { detail: env.ELEVENLABS_API_KEY } } });
  assert.deepEqual(await mediaPreflight(env, f.fetchImpl), { suno: { state: "authorization_denied" }, elevenlabs: { state: "payment_required" } });
  assert.deepEqual(f.called.sort(), [suno, user].sort());
});

test("zero balance, missing entitlement, and malformed balances fail closed", async () => {
  for (const [data, outcome] of [[0,"no_credits"], [{credit:0},"no_credits"], [{credits:3},"balance_available"], [null,"balance_unverified"], [-1,"balance_unverified"], [1.5,"balance_unverified"], ["4","balance_unverified"]]) {
    const f = fixture({ [suno]: { data: { code: 200, data } }, [user]: { data: {} } });
    const result = await mediaPreflight(env, f.fetchImpl);
    assert.equal(result.suno.state, outcome);
    assert.equal(result.elevenlabs.state,"entitlement_unverified");
    assert.equal(f.called.length, 2);
  }
});

test("narration checks quota before the catalog and ignores overage allowance", async () => {
  for (const [subscription, outcome] of [[{ ...account.subscription, status:"past_due" },"entitlement_unverified"], [{ status:"active" },"quota_unverified"], [{ status:"free", character_count:50, character_limit:50, can_extend_character_limit:true },"included_quota_exhausted"]]) {
    const f = fixture({ [user]: { data: { subscription } } });
    assert.equal((await mediaPreflight({ ...env, SUNO_API_KEY:"" }, f.fetchImpl)).elevenlabs.state, outcome);
    assert.deepEqual(f.called, [user]);
  }
});

test("requires selected voice and actual catalog visibility", async () => {
  const f = fixture({ [user]: { data: account }, [voices]: { data: { voices: [] } } });
  assert.equal((await mediaPreflight({ ...env,SUNO_API_KEY:"", ECHO_NARRATION_VOICE_ID:"" }, f.fetchImpl)).elevenlabs.state, "select_voice");
  assert.deepEqual(f.called, [user]);
  assert.equal((await mediaPreflight({ ...env,SUNO_API_KEY:"" }, f.fetchImpl)).elevenlabs.state, "voice_not_listed");
});

test("catalog scope failures and payload errors stay distinct from absence", async () => {
  for (const [reply,state] of [[{status:403,data:{}}, "authorization_denied"],[{data:{}}, "voice_unverified"]]) {
    const f = fixture({ [user]: { data: account }, [voices]: reply });
    assert.equal((await mediaPreflight({ ...env,SUNO_API_KEY:"" }, f.fetchImpl)).elevenlabs.state, state);
  }
});
