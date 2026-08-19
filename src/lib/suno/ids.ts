import { randomBytes } from "node:crypto";
import type { GenerateControls, JobAction, SongSpec } from "./types";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return value;
  }
  return new Date().toISOString();
}

export function parseSpec(raw: string | null | undefined): SongSpec | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SongSpec | { spec?: SongSpec };
    if (v && typeof v === "object" && "spec" in v && v.spec && typeof v.spec.title === "string") {
      return v.spec;
    }
    if (v && typeof v === "object" && "title" in v && typeof (v as SongSpec).title === "string") {
      return v as SongSpec;
    }
    return null;
  } catch {
    return null;
  }
}

export type JobRequest = {
  spec: SongSpec;
  action?: JobAction;
  controls?: GenerateControls;
  voice_id?: string | null;
  source_track_id?: string | null;
  source_track_id_b?: string | null;
  poll_kind?: "generate" | "stems" | "lyrics" | "wav" | "video";
  phase?: "submit" | "stems" | "sts" | "done";
  upload_url?: string | null;
  persona_name?: string;
  extra?: Record<string, unknown>;
};

export function parseJobRequest(raw: string | null | undefined): JobRequest {
  const specFallback: SongSpec = {
    concept: "",
    title: "Untitled",
    structure: [],
    vocal: { character: "", delivery: "" },
    production: { genre: [], tempo: "midtempo", instruments: [], mood: [] },
    lyrics: "",
    instrumental: false,
  };
  if (!raw) return { spec: specFallback };
  try {
    const v = JSON.parse(raw) as JobRequest & SongSpec;
    if (v && typeof v === "object" && v.spec && typeof v.spec.title === "string") {
      return v;
    }
    const spec = parseSpec(raw);
    return { spec: spec ?? specFallback };
  } catch {
    return { spec: specFallback };
  }
}

export function emptySpec(title = "Untitled"): SongSpec {
  return {
    concept: title,
    title,
    structure: [],
    vocal: { character: "", delivery: "" },
    production: { genre: [], tempo: "midtempo", instruments: [], mood: [] },
    lyrics: "",
    instrumental: false,
  };
}
