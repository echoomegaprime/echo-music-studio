import { useQuery } from "@tanstack/react-query";
import { Download, Pause, Play } from "lucide-react";
import { sunoTracks } from "@/lib/suno/api";
import { currentTrack, hasStemMix, usePlayerStore } from "@/lib/player-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TrackTools } from "@/components/studio/track-tools";

export function NowPlaying() {
  const store = usePlayerStore();
  const track = currentTrack(store);
  const listQ = useQuery({ queryKey: ["suno-tracks"], queryFn: () => sunoTracks({ data: {} }) });
  const recent = (listQ.data ?? []).slice(0, 6);
  const mixed = hasStemMix(track);

  return (
    <section className="space-y-5">
      <div>
        <p className="kicker">Now playing</p>
        <h2 className="mt-1 font-display text-2xl tracking-tight">{track?.title ?? "No track loaded"}</h2>
      </div>

      <div className="flex flex-col gap-5">
        <div className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface-2">
          {track?.artwork_url ? (
            <img src={track.artwork_url} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center px-6 text-center text-xs text-subtle">
              Artwork lands with the first render
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          {track ? (
            <>
              <p className="text-sm text-muted">
                {track.style || "Untitled style"} ·{" "}
                {track.provider === "suno"
                  ? "Suno"
                  : track.provider === "elevenlabs"
                    ? "Clone mix"
                    : "Echo sketch"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone={track.status === "complete" ? "ok" : "warn"}>{track.status}</Badge>
                <Badge>Variant {track.variant_label}</Badge>
                {mixed ? <Badge tone="accent">Stem mix</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!track.audio_url && !mixed}
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
                <TrackTools track={track} />
              </div>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              Talk to Echo, then generate. Finished tracks sit here while you keep writing.
            </p>
          )}
        </div>
      </div>

      {track?.timed_lyrics?.length ? (
        <>
          <Separator />
          <div className="max-h-40 overflow-auto text-sm leading-relaxed text-muted">
            {track.timed_lyrics.map((w, i) => (
              <span key={`${w.startS}-${i}`} className="mr-1">
                {w.word}
              </span>
            ))}
          </div>
        </>
      ) : track?.lyrics ? (
        <>
          <Separator />
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">
            {track.lyrics}
          </pre>
        </>
      ) : null}

      <Separator />
      <div>
        <p className="kicker mb-2">Recent</p>
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
                    {t.variant_label} · {t.provider === "suno" ? "Suno" : t.provider === "elevenlabs" ? "Clone" : "Sketch"}
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
