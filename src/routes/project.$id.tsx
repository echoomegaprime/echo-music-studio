import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StudioGate } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import { sunoMetadataUpdate, sunoProjects, sunoTracks } from "@/lib/suno/api";
import { usePlayerStore } from "@/lib/player-store";

export const Route = createFileRoute("/project/$id")({ component: ProjectPage });

function ProjectPage() {
  return (
    <StudioGate>
      <ProjectDetail />
    </StudioGate>
  );
}

function ProjectDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const projects = useQuery({ queryKey: ["suno-projects"], queryFn: () => sunoProjects() });
  const tracks = useQuery({
    queryKey: ["suno-tracks", id],
    queryFn: () => sunoTracks({ data: { projectId: id } }),
  });
  const library = useQuery({ queryKey: ["suno-tracks"], queryFn: () => sunoTracks({ data: {} }) });
  const project = (projects.data ?? []).find((p) => p.id === id);

  const add = useMutation({
    mutationFn: (trackId: string) =>
      sunoMetadataUpdate({
        data: { confirmation: "EXECUTE", trackId, project_id: id },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["suno-tracks"] });
      void qc.invalidateQueries({ queryKey: ["suno-projects"] });
      toast.success("Added to project");
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Project</p>
        <h1 className="font-display text-3xl tracking-tight">{project?.title ?? "Project"}</h1>
        <p className="mt-2 text-sm text-muted">{project?.concept}</p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(tracks.data ?? []).map((t, i) => (
          <li key={t.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
              onClick={() => playTrack(t, tracks.data ?? [t])}
            >
              <span className="w-6 font-mono text-xs tabular-nums text-subtle">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 truncate">{t.title}</span>
              <span className="text-xs text-subtle">{t.variant_label}</span>
            </button>
          </li>
        ))}
        {!tracks.data?.length ? (
          <li className="px-4 py-6 text-sm text-muted">No tracks in this project yet.</li>
        ) : null}
      </ul>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Add from library</p>
        <div className="flex flex-col gap-2">
          {(library.data ?? [])
            .filter((t) => t.project_id !== id)
            .slice(0, 12)
            .map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{t.title}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => add.mutate(t.id)}>
                  Add
                </Button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
