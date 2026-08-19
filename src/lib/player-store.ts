import { create } from "zustand";
import type { TrackPublic } from "@/lib/suno/types";

type PlayerState = {
  queue: TrackPublic[];
  index: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  setQueue: (tracks: TrackPublic[], index?: number) => void;
  playTrack: (track: TrackPublic, queue?: TrackPublic[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  setPlaying: (v: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  currentTime: 0,
  duration: 0,
  setQueue: (tracks, index = 0) => set({ queue: tracks, index }),
  playTrack: (track, queue) => {
    const list = queue ?? get().queue;
    const idx = list.findIndex((t) => t.id === track.id);
    set({
      queue: list.length ? list : [track],
      index: idx >= 0 ? idx : 0,
      playing: true,
      currentTime: 0,
    });
  },
  toggle: () => set({ playing: !get().playing }),
  next: () => {
    const { queue, index } = get();
    if (!queue.length) return;
    set({ index: (index + 1) % queue.length, playing: true, currentTime: 0 });
  },
  prev: () => {
    const { queue, index, currentTime } = get();
    if (!queue.length) return;
    if (currentTime > 2) {
      set({ currentTime: 0 });
      return;
    }
    set({ index: (index - 1 + queue.length) % queue.length, playing: true, currentTime: 0 });
  },
  setPlaying: (v) => set({ playing: v }),
  setProgress: (currentTime, duration) => set({ currentTime, duration }),
}));

export function currentTrack(s: PlayerState): TrackPublic | null {
  return s.queue[s.index] ?? null;
}
