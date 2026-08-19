import { randomBytes } from "node:crypto";

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

export function parseSpec(raw: string | null | undefined): import("./types").SongSpec | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as import("./types").SongSpec;
    if (!v || typeof v !== "object" || typeof v.title !== "string") return null;
    return v;
  } catch {
    return null;
  }
}
