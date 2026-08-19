import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef } from "react";
import { currentTrack, usePlayerStore } from "@/lib/player-store";

function fmt(t: number) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MiniPlayer() {
  const track = usePlayerStore(currentTrack);
  const playing = usePlayerStore((s) => s.playing);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const toggle = usePlayerStore((s) => s.toggle);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !track?.audio_url) return;
    const abs = new URL(track.audio_url, window.location.origin).href;
    if (el.src !== abs) el.src = track.audio_url;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [track?.id, track?.audio_url, playing, setPlaying]);

  if (!track) return null;

  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="fixed inset-x-0 bottom-14 z-20 border-t border-border bg-surface/95 px-3 py-2 md:bottom-0 md:px-6">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) =>
          setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)
        }
        onEnded={() => next()}
        onLoadedMetadata={(e) =>
          setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)
        }
      />
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <div className="size-11 shrink-0 overflow-hidden rounded-sm bg-surface-2">
          {track.artwork_url ? (
            <img src={track.artwork_url} alt="" className="size-full object-cover" />
          ) : (
            <div className="size-full bg-surface-2" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{track.title}</p>
          <p className="truncate text-xs text-muted">
            {track.style || track.provider} · Variant {track.variant_label}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="grid size-11 place-items-center text-muted hover:text-fg" onClick={prev}>
            <SkipBack className="size-4" />
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full bg-accent text-accent-fg"
            onClick={toggle}
            disabled={!track.audio_url}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
          </button>
          <button type="button" className="grid size-11 place-items-center text-muted hover:text-fg" onClick={next}>
            <SkipForward className="size-4" />
          </button>
        </div>
        <div className="hidden w-40 items-center gap-2 sm:flex">
          <span className="w-8 text-right font-mono text-[10px] tabular-nums text-subtle">
            {fmt(currentTime)}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-8 font-mono text-[10px] tabular-nums text-subtle">{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}
