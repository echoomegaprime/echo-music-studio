import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  elevenVoices,
  sunoGenerate,
  sunoPersona,
  sunoTimedLyrics,
  sunoTracks,
} from "@/lib/suno/api";
import type { JobAction, TrackPublic } from "@/lib/suno/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function newKey() {
  return crypto.randomUUID();
}

const ACTIONS: Array<{ id: JobAction; label: string; hint: string }> = [
  { id: "cover", label: "Cover", hint: "Restyle this clip" },
  { id: "extend", label: "Extend", hint: "Continue the arrangement" },
  { id: "mashup", label: "Mashup", hint: "Blend with another track" },
  { id: "add_vocals", label: "Add vocals", hint: "Sing over an instrumental" },
  { id: "add_instrumental", label: "Add instrumental", hint: "Bed under a vocal" },
  { id: "stems", label: "Split stems", hint: "Vocals + instrumental" },
  { id: "inject_voice", label: "Inject clone", hint: "Replace vocal with ElevenLabs" },
  { id: "wav", label: "WAV", hint: "Studio wav export" },
  { id: "video", label: "Video", hint: "MP4 visualizer" },
  { id: "lyrics", label: "Lyrics", hint: "Generate a lyric sheet" },
];

export function TrackTools({ track }: { track: TrackPublic }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<JobAction>("cover");
  const [otherId, setOtherId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [notes, setNotes] = useState("");
  const voicesQ = useQuery({ queryKey: ["eleven-voices"], queryFn: () => elevenVoices() });
  const tracksQ = useQuery({ queryKey: ["suno-tracks"], queryFn: () => sunoTracks({ data: {} }) });

  const spec = track.song_spec ?? {
    concept: track.prompt || track.title,
    title: track.title,
    structure: [],
    vocal: { character: "", delivery: "" },
    production: { genre: track.style ? [track.style] : [], tempo: "midtempo" as const, instruments: [], mood: [] },
    lyrics: notes || track.lyrics,
    instrumental: false,
  };

  const run = useMutation({
    mutationFn: () =>
      sunoGenerate({
        data: {
          confirmation: "EXECUTE",
          idempotency_key: newKey(),
          spec: { ...spec, lyrics: notes || spec.lyrics, concept: notes || spec.concept },
          mode: "suno",
          action,
          source_track_id: track.id,
          source_track_id_b: action === "mashup" ? otherId || null : null,
          voice_id: action === "inject_voice" ? voiceId || null : null,
        },
      }),
    onSuccess: (res) => {
      if (!res.receipt.ok) {
        toast.error(res.receipt.error_message ?? "Blocked");
        return;
      }
      setOpen(false);
      toast.success(`${action.replace("_", " ")} submitted`);
      void qc.invalidateQueries({ queryKey: ["suno-jobs"] });
      void qc.invalidateQueries({ queryKey: ["suno-tracks"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const timed = useMutation({
    mutationFn: () => sunoTimedLyrics({ data: { confirmation: "EXECUTE", trackId: track.id } }),
    onSuccess: () => {
      toast.success("Timed lyrics stored");
      void qc.invalidateQueries({ queryKey: ["suno-tracks"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const persona = useMutation({
    mutationFn: () =>
      sunoPersona({
        data: {
          confirmation: "EXECUTE",
          trackId: track.id,
          name: personaName || track.title,
          description: notes || track.style,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Persona ${res.personaId}`);
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Tools
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={track.title} className="w-[min(92vw,520px)] max-h-[80dvh] overflow-y-auto">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAction(a.id)}
                  className={`rounded-lg border px-3 py-2.5 text-left ${
                    action === a.id ? "border-accent bg-surface-2" : "border-border"
                  }`}
                >
                  <span className="block font-medium">{a.label}</span>
                  <span className="text-[11px] text-muted">{a.hint}</span>
                </button>
              ))}
            </div>
            {action === "mashup" ? (
              <div className="space-y-1.5">
                <Label htmlFor="other">Second track</Label>
                <select
                  id="other"
                  value={otherId}
                  onChange={(e) => setOtherId(e.target.value)}
                  className="flex h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm"
                >
                  <option value="">Pick a track</option>
                  {(tracksQ.data ?? [])
                    .filter((t) => t.id !== track.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.variant_label}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}
            {action === "inject_voice" ? (
              <div className="space-y-1.5">
                <Label htmlFor="clone">Cloned voice</Label>
                <select
                  id="clone"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="flex h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm"
                >
                  <option value="">Pick a voice</option>
                  {(voicesQ.data ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Direction</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional rewrite, lyric, or style note"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? "Submitting…" : `Run ${action.replaceAll("_", " ")}`}
            </Button>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                disabled={timed.isPending}
                onClick={() => timed.mutate()}
              >
                Timed lyrics
              </Button>
              <div className="flex gap-2">
                <Input
                  placeholder="Persona name"
                  value={personaName}
                  onChange={(e) => setPersonaName(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={persona.isPending}
                  onClick={() => persona.mutate()}
                >
                  Persona
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
