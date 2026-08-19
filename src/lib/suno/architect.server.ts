import type { SongSpec } from "./types";

const SYSTEM = `You are the Echo Song Architect. Turn a user's idea into a complete SongSpec JSON object for Suno generation.
Rules:
- Return ONLY valid JSON. No markdown.
- Lyrics must be original, singable, and structured with markers like [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro].
- 2 verses + chorus + bridge unless instrumental.
- Title: 2–5 words, memorable, no quotes.
- Production should be specific (instruments, tempo, mood).
- Vocal character should be concrete.
- If the idea is West Texas / Echo / outlaw / machine, lean dark country + southern rock + cinematic — never parody.
JSON shape:
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

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in architect response");
  return JSON.parse(raw.slice(start, end + 1));
}

function normalize(raw: unknown, idea: string): SongSpec {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const vocal = (o.vocal && typeof o.vocal === "object" ? o.vocal : {}) as Record<string, unknown>;
  const prod = (o.production && typeof o.production === "object" ? o.production : {}) as Record<string, unknown>;
  const tempo = prod.tempo === "slow" || prod.tempo === "fast" ? prod.tempo : "midtempo";
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
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

export async function architectSong(idea: string): Promise<{ spec: SongSpec; source: "grok" | "local" }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { spec: normalize({}, idea), source: "local" };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.8,
      max_tokens: 1800,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: idea.trim().slice(0, 2000) },
      ],
    }),
  });
  if (!res.ok) return { spec: normalize({}, idea), source: "local" };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  try {
    return { spec: normalize(extractJson(text), idea), source: "grok" };
  } catch {
    return { spec: normalize({}, idea), source: "local" };
  }
}
