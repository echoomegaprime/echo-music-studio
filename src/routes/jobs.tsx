import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StudioGate } from "@/components/studio-shell";
import { Badge } from "@/components/ui/badge";
import { sunoJobs } from "@/lib/suno/api";
import { TERMINAL_STATES, type JobState } from "@/lib/suno/types";

export const Route = createFileRoute("/jobs")({ component: JobsPage });

function tone(state: JobState): "ok" | "warn" | "danger" | "muted" {
  if (state === "ARTIFACT_READY" || state === "COMPLETE") return "ok";
  if (state === "FAILED") return "danger";
  if (state === "CANCELED") return "muted";
  return "warn";
}

function JobsPage() {
  return (
    <StudioGate>
      <Jobs />
    </StudioGate>
  );
}

function Jobs() {
  const q = useQuery({
    queryKey: ["suno-jobs"],
    queryFn: () => sunoJobs(),
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      return rows.some((j) => !TERMINAL_STATES.has(j.state)) ? 3000 : false;
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">State machine</p>
        <h1 className="font-display text-3xl tracking-tight">Jobs</h1>
      </div>
      <ul className="space-y-2">
        {(q.data ?? []).map((job) => (
          <li key={job.id} className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs text-subtle">{job.id}</p>
              <Badge tone={tone(job.state)}>{job.state}</Badge>
            </div>
            <p className="mt-1 text-sm">
              {job.action} · {job.provider === "suno" ? "Suno" : "Echo sketch"} · {job.track_ids.length}{" "}
              tracks
            </p>
            {job.error_message ? (
              <p className="mt-1 text-xs text-danger">{job.error_message}</p>
            ) : null}
            {job.irreversible_external_cost ? (
              <p className="mt-1 text-[11px] uppercase tracking-wider text-warn">
                Irreversible external cost
              </p>
            ) : null}
          </li>
        ))}
        {!q.isPending && !q.data?.length ? (
          <li className="text-sm text-muted">No jobs yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
