import { useQuery } from "@tanstack/react-query";
import { Download, Pause, Play } from "lucide-react";
import { sunoTracks } from "@/lib/suno/api";
import { currentTrack, usePlayerStore } from "@/lib/player-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function NowPlaying() {
  const store = usePlayerStore();
  const track = currentTrack(store);
  const listQ = useQuery({ queryKey: ["suno-tracks"], queryFn: () => sunoTracks({ data: {} }) });
  const recent = (listQ.data ?? []).slice(0, 6);

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Now playing</p>
        <h2 className="font-display text-2xl tracking-tight">{track?.title ?? "No track loaded"}</h2>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="aspect-square w-full max-w-56 overflow-hidden rounded-lg border border-border bg-surface-2">
          {track?.artwork_url ? (
            <img src={track.artwork_url} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-xs text-subtle">Artwork</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {track ? (
            <>
              <p className="text-sm text-muted">
                {track.style || "Untitled style"} · {track.provider === "suno" ? "Suno" : "Echo sketch"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone={track.status === "complete" ? "ok" : "warn"}>{track.status}</Badge>
                <Badge>Variant {track.variant_label}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!track.audio_url}
                  onClick={() => store.toggle()}
                >
                  {store.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {store.playing ? "Pause" : "Play"}
                </Button>
                {track.audio_url ? (
                  <Button type="button" size="sm" variant="secondary" asChild>
                    <a href={track.audio_url} download={`${track.title}.audio`}>
                      <Download className="size-3.5" />
                      Download
                    </a>
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Architect a song, then generate. Tracks land here.</p>
          )}
        </div>
      </div>

      {track?.lyrics ? (
        <>
          <Separator />
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">
            {track.lyrics}
          </pre>
        </>
      ) : null}

      <Separator />
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted">Recent generations</p>
        <ul className="space-y-1">
          {recent.length === 0 ? (
            <li className="text-sm text-subtle">Nothing generated yet.</li>
          ) : (
            recent.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-surface-2"
                  onClick={() => store.playTrack(t, listQ.data ?? [t])}
                >
                  <span className="truncate text-sm">{t.title}</span>
                  <span className="ml-3 shrink-0 text-xs text-subtle">
                    {t.variant_label} · {t.provider === "suno" ? "Suno" : "Sketch"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
