import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { architectChat } from "./architect.server";
import { newChatMessage } from "./chat";
import {
  boostStyle,
  createPersonaFromTrack,
  createProject,
  getDraft,
  getStatus,
  getTrack,
  getUsage,
  listJobs,
  listProjects,
  listStems,
  listTracks,
  refreshActiveJobs,
  refreshJob,
  saveDraft,
  saveMixedTrack,
  startGeneration,
  timestampedLyrics,
  updateProject,
  updateTrack,
  type GenerateInput,
} from "./engine.server";
import { clearVault, saveVault } from "./vault.server";
import { clearElevenVault, saveElevenVault } from "@/lib/eleven/vault.server";
import { cloneVoice, deleteVoice, listVoices, speakWithVoice } from "./voices.server";
import type { ArchitectModel, ChatMessage, SongSpec } from "./types";

export const sunoStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => getStatus(context.userId));

export const sunoUsage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => getUsage(context.userId));

export const sunoCapabilities = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const status = await getStatus(context.userId);
    return status.capabilities;
  });

export const sunoSaveVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { apiKey: string; baseUrl: string }) => input)
  .handler(async ({ context, data }) => {
    if (!data.apiKey?.trim()) throw new Error("API key required");
    const saved = await saveVault(context.userId, data.apiKey, data.baseUrl);
    return {
      hint: saved.hint,
      authenticated: saved.authenticated,
      error: saved.error,
      capabilities: saved.capabilities,
    };
  });

export const sunoClearVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await clearVault(context.userId);
    return { ok: true as const };
  });

export const elevenSaveVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { apiKey: string }) => input)
  .handler(async ({ context, data }) => {
    if (!data.apiKey?.trim()) throw new Error("API key required");
    return saveElevenVault(context.userId, data.apiKey);
  });

export const elevenClearVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await clearElevenVault(context.userId);
    return { ok: true as const };
  });

export const elevenVoices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => listVoices(context.userId));

export const elevenClone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      confirmation: string;
      name: string;
      description: string;
      files: Array<{ filename: string; mime: string; b64: string }>;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    if (data.confirmation !== "EXECUTE") throw new Error("CONFIRMATION_REQUIRED");
    if (!data.files.length) throw new Error("Add at least one sample");
    const files = data.files.slice(0, 4).map((f) => {
      const buf = Buffer.from(f.b64, "base64");
      if (buf.byteLength < 1000) throw new Error(`Sample ${f.filename} is too small`);
      if (buf.byteLength > 8_000_000) throw new Error(`Sample ${f.filename} exceeds 8MB`);
      return { filename: f.filename, mime: f.mime || "audio/mpeg", bytes: new Uint8Array(buf) };
    });
    return cloneVoice(context.userId, {
      name: data.name,
      description: data.description,
      files,
    });
  });

export const elevenDeleteVoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { confirmation: string; id: string }) => input)
  .handler(async ({ context, data }) => {
    if (data.confirmation !== "EXECUTE") throw new Error("CONFIRMATION_REQUIRED");
    await deleteVoice(context.userId, data.id);
    return { ok: true as const };
  });

export const elevenSpeak = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { voiceId: string; text: string }) => input)
  .handler(async ({ context, data }) => speakWithVoice(context.userId, data.voiceId, data.text));

export const sunoArchitect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { idea?: string; messages?: ChatMessage[]; model?: ArchitectModel }) => input)
  .handler(async ({ context, data }) => {
    const prior = data.messages ?? [];
    const idea = (data.idea ?? prior.filter((m) => m.role === "user").at(-1)?.content ?? "").trim();
    if (!idea && prior.length === 0) throw new Error("Describe the song first");
    const history = prior.length
      ? prior.map((m) => ({
          role: m.role,
          content: m.spec ? `${m.content}\n\n[spec]\n${JSON.stringify(m.spec)}` : m.content,
        }))
      : [{ role: "user" as const, content: idea }];
    const result = await architectChat(history, data.model);
    const userMsg = prior.length ? prior : [newChatMessage("user", idea)];
    const assistant = newChatMessage("assistant", result.reply, result.spec);
    const messages = [...userMsg, assistant].slice(-24);
    await saveDraft(context.userId, idea, result.spec, messages);
    return { ...result, messages };
  });

export const sunoGetDraft = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => getDraft(context.userId));

export const sunoSaveDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { idea: string; spec: SongSpec | null; messages?: ChatMessage[] }) => input,
  )
  .handler(async ({ context, data }) => {
    await saveDraft(context.userId, data.idea, data.spec, data.messages);
    return { ok: true as const };
  });

export const sunoGenerate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: GenerateInput) => input)
  .handler(async ({ context, data }) => startGeneration(context.userId, data));

export const sunoJobStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string }) => input)
  .handler(async ({ context, data }) => refreshJob(context.userId, data.jobId));

export const sunoJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await refreshActiveJobs(context.userId);
    return listJobs(context.userId);
  });

export const sunoTracks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { projectId?: string | null }) => input ?? {})
  .handler(async ({ context, data }) => listTracks(context.userId, data.projectId));

export const sunoTrackGet = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { trackId: string }) => input)
  .handler(async ({ context, data }) => getTrack(context.userId, data.trackId));

export const sunoMetadataUpdate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      confirmation: string;
      trackId: string;
      title?: string;
      tags?: string;
      project_id?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    if (data.confirmation !== "EXECUTE") throw new Error("CONFIRMATION_REQUIRED");
    return updateTrack(context.userId, data.trackId, {
      title: data.title,
      tags: data.tags,
      project_id: data.project_id,
    });
  });

export const sunoProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => listProjects(context.userId));

export const sunoProjectCreate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { confirmation: string; title: string; concept: string }) => input)
  .handler(async ({ context, data }) => {
    if (data.confirmation !== "EXECUTE") throw new Error("CONFIRMATION_REQUIRED");
    return createProject(context.userId, data.title, data.concept);
  });

export const sunoProjectUpdate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { confirmation: string; id: string; title?: string; concept?: string }) => input,
  )
  .handler(async ({ context, data }) => {
    if (data.confirmation !== "EXECUTE") throw new Error("CONFIRMATION_REQUIRED");
    return updateProject(context.userId, data.id, { title: data.title, concept: data.concept });
  });

export const sunoBoostStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { content: string }) => input)
  .handler(async ({ context, data }) => boostStyle(context.userId, data.content));

export const sunoTimedLyrics = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { confirmation: string; trackId: string }) => input)
  .handler(async ({ context, data }) => {
    if (data.confirmation !== "EXECUTE") throw new Error("CONFIRMATION_REQUIRED");
    return timestampedLyrics(context.userId, data.trackId);
  });

export const sunoPersona = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { confirmation: string; trackId: string; name: string; description: string }) => input,
  )
  .handler(async ({ context, data }) => {
    if (data.confirmation !== "EXECUTE") throw new Error("CONFIRMATION_REQUIRED");
    return createPersonaFromTrack(context.userId, data.trackId, data.name, data.description);
  });

export const sunoStems = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { trackId: string }) => input)
  .handler(async ({ context, data }) => listStems(context.userId, data.trackId));

export const sunoSaveMix = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      confirmation: string;
      title: string;
      parent_track_id: string | null;
      wav_b64: string;
      mime?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    if (data.confirmation !== "EXECUTE") throw new Error("CONFIRMATION_REQUIRED");
    return saveMixedTrack(context.userId, data);
  });
