import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  sunoArchitect,
  sunoGenerate,
  sunoGetDraft,
  sunoSaveDraft,
  sunoStatus,
} from "@/lib/suno/api";
import type { SongSpec } from "@/lib/suno/types";
import { usePlayerStore } from "@/lib/player-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function newKey() {
  return crypto.randomUUID();
}

export function ComposePanel() {
  const qc = useQueryClient();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const statusQ = useQuery({ queryKey: ["suno-status"], queryFn: () => sunoStatus() });
  const draftQ = useQuery({ queryKey: ["suno-draft"], queryFn: () => sunoGetDraft() });
  const [idea, setIdea] = useState("");
  const [spec, setSpec] = useState<SongSpec | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<"suno" | "sketch">("sketch");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!draftQ.data || hydrated) return;
    setIdea(draftQ.data.idea);
    setSpec(draftQ.data.spec);
    setHydrated(true);
  }, [draftQ.data, hydrated]);

  const connected = Boolean(statusQ.data?.provider_authenticated);
  const usage = statusQ.data?.usage;

  const architect = useMutation({
    mutationFn: () => sunoArchitect({ data: { idea } }),
    onSuccess: (res) => {
      setSpec(res.spec);
      toast.success(res.source === "grok" ? "Song architected" : "Local architect used");
      void qc.invalidateQueries({ queryKey: ["suno-draft"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generate = useMutation({
    mutationFn: () => {
      if (!spec) throw new Error("Architect a song first");
      return sunoGenerate({
        data: {
          confirmation: "EXECUTE",
          idempotency_key: newKey(),
          spec,
          mode,
          action: mode === "sketch" ? "sketch" : "generate",
        },
      });
    },
    onSuccess: (res) => {
      setOpen(false);
      if (!res.receipt.ok) {
        toast.error(res.receipt.error_message ?? "Generation blocked");
        return;
      }
      toast.success(mode === "suno" ? "Submitted to Suno" : "Sketch ready");
      void qc.invalidateQueries({ queryKey: ["suno-tracks"] });
      void qc.invalidateQueries({ queryKey: ["suno-jobs"] });
      void qc.invalidateQueries({ queryKey: ["suno-status"] });
      const first = res.tracks[0];
      if (first) playTrack(first, res.tracks);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function patchSpec(partial: Partial<SongSpec>) {
    if (!spec) return;
    const next = { ...spec, ...partial };
    setSpec(next);
    void sunoSaveDraft({ data: { idea, spec: next } });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Song architect</p>
          <h2 className="font-display text-2xl tracking-tight">Compose</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <Badge tone="ok">Suno connected</Badge>
          ) : (
            <Badge tone="warn">Suno vault empty</Badge>
          )}
          {usage ? (
            <Badge>
              {usage.suno_generates}/{usage.suno_ceiling} suno
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="idea">Idea</Label>
        <Textarea
          id="idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Dark cinematic outlaw-country about building Echo in West Texas dust"
          rows={3}
        />
      </div>
      <Button
        type="button"
        onClick={() => architect.mutate()}
        disabled={!idea.trim() || architect.isPending}
      >
        {architect.isPending ? "Architecting…" : "Architect song"}
      </Button>

      {spec ? (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={spec.title}
                onChange={(e) => patchSpec({ title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concept">Concept</Label>
              <Input
                id="concept"
                value={spec.concept}
                onChange={(e) => patchSpec({ concept: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            {spec.production.genre.join(" · ")} · {spec.production.tempo} · {spec.vocal.character}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {spec.structure.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lyrics">Lyrics</Label>
            <Textarea
              id="lyrics"
              className="min-h-56 font-mono text-[13px] leading-relaxed"
              value={spec.lyrics}
              onChange={(e) => patchSpec({ lyrics: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button type="button">Generate</Button>
              </DialogTrigger>
              <DialogContent title="Confirm generation">
                <div className="space-y-4 text-sm">
                  <p className="text-muted">
                    {connected
                      ? "Render through your Suno account, or keep it local as an Echo sketch."
                      : "Suno is not connected. You can still render a local studio sketch — no provider credits."}
                  </p>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("suno")}
                      disabled={!connected}
                      className={`rounded-md border px-3 py-3 text-left ${
                        mode === "suno" ? "border-accent bg-surface-2" : "border-border"
                      } disabled:opacity-40`}
                    >
                      <span className="block font-medium">Suno account</span>
                      <span className="text-xs text-muted">
                        Consumes your provider credits. Irreversible.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("sketch")}
                      className={`rounded-md border px-3 py-3 text-left ${
                        mode === "sketch" ? "border-accent bg-surface-2" : "border-border"
                      }`}
                    >
                      <span className="block font-medium">Echo sketch</span>
                      <span className="text-xs text-muted">
                        Local structure preview. Not a Suno render.
                      </span>
                    </button>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={generate.isPending || (mode === "suno" && !connected)}
                    onClick={() => generate.mutate()}
                  >
                    {generate.isPending
                      ? "Working…"
                      : mode === "suno"
                        ? "Generate 2 tracks using Suno"
                        : "Render 2 sketch variants"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <span className="text-xs text-muted">Creates two variants. Confirmation required.</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
