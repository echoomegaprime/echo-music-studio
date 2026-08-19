import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { StudioGate } from "@/components/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sunoMetadataUpdate, sunoTracks } from "@/lib/suno/api";
import { usePlayerStore } from "@/lib/player-store";

export const Route = createFileRoute("/library")({ component: LibraryPage });

function LibraryPage() {
  return (
    <StudioGate>
      <Library />
    </StudioGate>
  );
}

function Library() {
  const qc = useQueryClient();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const q = useQuery({ queryKey: ["suno-tracks"], queryFn: () => sunoTracks({ data: {} }) });
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const save = useMutation({
    mutationFn: () =>
      sunoMetadataUpdate({
        data: { confirmation: "EXECUTE", trackId: editing!, title },
      }),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["suno-tracks"] });
      toast.success("Track updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Catalog</p>
        <h1 className="font-display text-3xl tracking-tight">Library</h1>
      </div>
      {q.isPending ? (
        <p className="text-sm text-muted">Loading tracks…</p>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted">No tracks yet. Generate from Studio.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {q.data.map((t) => (
            <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => playTrack(t, q.data)}
              >
                <div className="size-12 overflow-hidden rounded-sm bg-surface-2">
                  {t.artwork_url ? (
                    <img src={t.artwork_url} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted">
                    {t.style || "No tags"} · {t.variant_label}
                  </p>
                </div>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={t.provider === "suno" ? "ok" : "muted"}>
                  {t.provider === "suno" ? "Suno" : "Sketch"}
                </Badge>
                {editing === t.id ? (
                  <>
                    <Input
                      className="h-9 w-40"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                    <Button type="button" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                      Save
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(t.id);
                      setTitle(t.title);
                    }}
                  >
                    Rename
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
