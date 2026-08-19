import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { architectSong } from "./architect.server";
import {
  createProject,
  getDraft,
  getStatus,
  getTrack,
  getUsage,
  listJobs,
  listProjects,
  listTracks,
  refreshActiveJobs,
  refreshJob,
  saveDraft,
  startGeneration,
  updateProject,
  updateTrack,
  type GenerateInput,
} from "./engine.server";
import { clearVault, saveVault } from "./vault.server";
import type { SongSpec } from "./types";

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

export const sunoArchitect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { idea: string }) => input)
  .handler(async ({ context, data }) => {
    const idea = data.idea.trim();
    if (!idea) throw new Error("Describe the song first");
    const result = await architectSong(idea);
    await saveDraft(context.userId, idea, result.spec);
    return result;
  });

export const sunoGetDraft = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => getDraft(context.userId));

export const sunoSaveDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { idea: string; spec: SongSpec | null }) => input)
  .handler(async ({ context, data }) => {
    await saveDraft(context.userId, data.idea, data.spec);
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
