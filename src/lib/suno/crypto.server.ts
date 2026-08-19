import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function vaultKey(): Buffer {
  const secret =
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.XAI_API_KEY?.trim() ||
    "echo-suno-preview-vault";
  return scryptSync(secret, "echo-suno-vault-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(packed: string): string {
  const [ivB, tagB, dataB] = packed.split(".");
  if (!ivB || !tagB || !dataB) throw new Error("Malformed vault payload");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hintOf(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length < 8) return "••••";
  return `••••${trimmed.slice(-4)}`;
}
