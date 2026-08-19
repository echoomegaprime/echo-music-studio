import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef } from "react";
import { currentTrack, hasStemMix, usePlayerStore } from "@/lib/player-store";

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
  const vocalGain = usePlayerStore((s) => s.vocalGain);
  const toggle = usePlayerStore((s) => s.toggle);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setVocalGain = usePlayerStore((s) => s.setVocalGain);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vocalRef = useRef<HTMLAudioElement | null>(null);
  const instRef = useRef<HTMLAudioElement | null>(null);
  const mixed = hasStemMix(track);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !track?.audio_url || mixed) return;
    if (el.src !== new URL(track.audio_url, window.location.origin).href) el.src = track.audio_url;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [track?.id, track?.audio_url, playing, setPlaying, mixed]);

  useEffect(() => {
    if (!mixed || !track) return;
    const v = vocalRef.current;
    const i = instRef.current;
    if (!v || !i) return;
    if (track.vocal_url && v.src !== new URL(track.vocal_url, window.location.origin).href) {
      v.src = track.vocal_url;
    }
    if (track.instrumental_url && i.src !== new URL(track.instrumental_url, window.location.origin).href) {
      i.src = track.instrumental_url;
    }
    v.volume = vocalGain;
    i.volume = 1;
    if (playing) {
      void Promise.all([v.play(), i.play()]).catch(() => setPlaying(false));
    } else {
      v.pause();
      i.pause();
    }
  }, [mixed, track, playing, vocalGain, setPlaying]);

  if (!track) return null;

  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const playable = Boolean(track.audio_url || (track.vocal_url && track.instrumental_url));

  return (
    <div className="fixed inset-x-0 bottom-14 z-20 border-t border-border bg-surface/95 px-3 py-2 md:bottom-0 md:px-6">
      {mixed ? (
        <>
          <audio
            ref={vocalRef}
            preload="metadata"
            onTimeUpdate={(e) =>
              setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)
            }
            onEnded={() => next()}
          />
          <audio ref={instRef} preload="metadata" />
        </>
      ) : (
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
      )}
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
            {track.style || track.provider} · {track.variant_label}
            {mixed ? " · clone mix" : ""}
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
            disabled={!playable}
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
        {mixed ? (
          <label className="hidden items-center gap-2 text-[10px] uppercase tracking-wider text-subtle lg:flex">
            Vocal
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={vocalGain}
              onChange={(e) => setVocalGain(Number(e.target.value))}
              className="w-20"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
