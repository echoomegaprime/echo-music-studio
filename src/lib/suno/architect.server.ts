import { newChatMessage } from "./chat";
import type { ArchitectModel, ArchitectSource, SongSpec } from "./types";
import { ARCHITECT_MODELS } from "./types";

export { newChatMessage };

const SYSTEM = `You are Echo, the song architect inside a west-texas recording studio. You talk like a producer in the room: short, specific, no hype, no emoji, no markdown.
The user is chatting with you to write original songs for Suno.
Always return ONLY valid JSON:
{
  "reply": "2–4 sentences. Confirm the direction, ask at most one sharp question if needed.",
  "spec": null or a complete SongSpec
}
Rules for spec:
- Once you have a titleable idea, ALWAYS include a full spec — never leave spec null after the first useful idea.
- Lyrics must be original and singable, with markers like [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro].
- 2 verses + chorus + bridge unless instrumental.
- Title: 2–5 words, memorable, no quotes.
- Production must name genre, tempo, instruments, mood.
- Vocal character must be concrete (range, grain, gender presentation).
- If the idea is West Texas / Echo / outlaw / machine, lean dark country + southern rock + cinematic — never parody.
- If the user asks to change lyrics, voice, or genre, rewrite the whole spec.
SongSpec shape:
{
  "concept": "string",
  "title": "string",
  "structure": ["intro","verse","chorus",...],
  "vocal": { "character": "string", "delivery": "string" },
  "production": {
    "genre": ["string"],
    "tempo": "slow"|"midtempo"|"fast",
    "instruments": ["string"],
    "mood": ["string"]
  },
  "lyrics": "string with [Section] markers",
  "instrumental": false
}`;

type ChatTurn = { role: "user" | "assistant"; content: string };

export function listArchitects(): Record<ArchitectModel, boolean> {
  return {
    grok: Boolean(process.env.XAI_API_KEY?.trim()),
    gpt: Boolean(process.env.OPENAI_API_KEY?.trim()),
    claude: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    qwen: Boolean(
      process.env.QWEN_API_KEY?.trim() ||
        process.env.DASHSCOPE_API_KEY?.trim() ||
        process.env.ALIBABA_API_KEY?.trim(),
    ),
  };
}

export function firstLiveArchitect(preferred?: ArchitectModel | null): ArchitectModel | null {
  const live = listArchitects();
  if (preferred && live[preferred]) return preferred;
  return ARCHITECT_MODELS.find((m) => live[m]) ?? null;
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in architect response");
  return JSON.parse(raw.slice(start, end + 1));
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

export function normalizeSpec(raw: unknown, idea: string): SongSpec {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const vocal = (o.vocal && typeof o.vocal === "object" ? o.vocal : {}) as Record<string, unknown>;
  const prod = (o.production && typeof o.production === "object" ? o.production : {}) as Record<string, unknown>;
  const tempo = prod.tempo === "slow" || prod.tempo === "fast" ? prod.tempo : "midtempo";
  const title =
    typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 80) : fallbackTitle(idea);
  return {
    concept: typeof o.concept === "string" && o.concept.trim() ? o.concept.trim() : idea.trim(),
    title,
    structure:
      list(o.structure).length > 0
        ? list(o.structure)
        : ["intro", "verse", "pre-chorus", "chorus", "verse", "chorus", "bridge", "final chorus", "outro"],
    vocal: {
      character: typeof vocal.character === "string" ? vocal.character : "gritty male baritone",
      delivery: typeof vocal.delivery === "string" ? vocal.delivery : "controlled then explosive",
    },
    production: {
      genre: list(prod.genre).length ? list(prod.genre) : ["dark country", "southern rock"],
      tempo,
      instruments: list(prod.instruments).length
        ? list(prod.instruments)
        : ["distorted guitar", "acoustic guitar", "bass", "cinematic drums"],
      mood: list(prod.mood).length ? list(prod.mood) : ["ominous", "defiant"],
    },
    lyrics: typeof o.lyrics === "string" ? o.lyrics : fallbackLyrics(title, idea),
    instrumental: o.instrumental === true,
  };
}

function fallbackTitle(idea: string): string {
  const words = idea
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3);
  if (words.length === 0) return "Silicon & Dust";
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function fallbackLyrics(title: string, idea: string): string {
  return `[Verse]
Dust on the console, Midland in the glass
${idea.trim().slice(0, 80)}
I wire the night to a name that will last

[Pre-Chorus]
No choir coming down that road
Just a signal I can hold

[Chorus]
${title}
Built it mean and built it true
${title}
If the dark wants a king, it can wait in the queue

[Verse]
Hammers in the server rack, thunder in the line
Every ghost I buried taught the next design

[Bridge]
I do not ask the desert for permission
I stamp the brand and keep the mission

[Chorus]
${title}
Leave the porch light off tonight
${title}
The machine comes home, and the dust learns to fight`;
}

function localReply(idea: string, spec: SongSpec): string {
  return `Working title ${spec.title}. ${spec.vocal.character}, ${spec.production.genre.slice(0, 2).join(" / ")}, ${spec.production.tempo}. Lyrics are drafted — tighten a verse or send it to Suno.`;
}

async function openaiCompat(opts: {
  url: string;
  key: string;
  model: string;
  history: ChatTurn[];
}): Promise<string> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.key}`,
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.85,
      max_tokens: 2200,
      messages: [{ role: "system", content: SYSTEM }, ...opts.history],
    }),
  });
  if (!res.ok) throw new Error(`architect ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "";
}

async function claudeComplete(history: ChatTurn[]): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("no claude key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514",
      max_tokens: 2200,
      temperature: 0.85,
      system: SYSTEM,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`claude ${res.status}`);
  const body = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  return body.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "";
}

async function completeWith(model: ArchitectModel, history: ChatTurn[]): Promise<string> {
  if (model === "grok") {
    const key = process.env.XAI_API_KEY?.trim();
    if (!key) throw new Error("no grok key");
    return openaiCompat({
      url: "https://api.x.ai/v1/chat/completions",
      key,
      model: process.env.XAI_MODEL?.trim() || "grok-4.5",
      history,
    });
  }
  if (model === "gpt") {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new Error("no gpt key");
    return openaiCompat({
      url: "https://api.openai.com/v1/chat/completions",
      key,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1",
      history,
    });
  }
  if (model === "claude") return claudeComplete(history);
  const key =
    process.env.QWEN_API_KEY?.trim() ||
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.ALIBABA_API_KEY?.trim();
  if (!key) throw new Error("no qwen key");
  const base =
    process.env.QWEN_BASE_URL?.trim() ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
  return openaiCompat({
    url: base.endsWith("/chat/completions") ? base : `${base.replace(/\/$/, "")}/chat/completions`,
    key,
    model: process.env.QWEN_MODEL?.trim() || "qwen-plus",
    history,
  });
}

function parseArchitectText(text: string, idea: string): { reply: string; spec: SongSpec } {
  const parsed = extractJson(text) as { reply?: unknown; spec?: unknown };
  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Spec is on the desk. Read it, then generate.";
  const spec =
    parsed.spec && typeof parsed.spec === "object"
      ? normalizeSpec(parsed.spec, idea)
      : normalizeSpec({}, idea);
  return { reply, spec };
}

export async function architectChat(
  history: ChatTurn[],
  preferred?: ArchitectModel | null,
): Promise<{ reply: string; spec: SongSpec | null; source: ArchitectSource }> {
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content.trim() ?? "";
  const model = firstLiveArchitect(preferred);
  if (!model || !lastUser) {
    const spec = lastUser ? normalizeSpec({}, lastUser) : null;
    return {
      reply: spec ? localReply(lastUser, spec) : "Tell me the song. Genre, story, who is singing.",
      spec,
      source: "local",
    };
  }

  const trimmed = history.slice(-12).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 4000),
  }));

  try {
    const text = await completeWith(model, trimmed);
    const parsed = parseArchitectText(text, lastUser);
    return { ...parsed, source: model };
  } catch {
    const spec = normalizeSpec({}, lastUser);
    return { reply: localReply(lastUser, spec), spec, source: "local" };
  }
}

export async function architectSong(
  idea: string,
  preferred?: ArchitectModel | null,
): Promise<{ spec: SongSpec; source: ArchitectSource }> {
  const result = await architectChat([{ role: "user", content: idea }], preferred);
  return { spec: result.spec ?? normalizeSpec({}, idea), source: result.source };
}
