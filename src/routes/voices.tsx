import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { StudioGate } from "@/components/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  elevenClone,
  elevenDeleteVoice,
  elevenSpeak,
  elevenVoices,
  sunoStatus,
} from "@/lib/suno/api";

export const Route = createFileRoute("/voices")({ component: VoicesPage });

function VoicesPage() {
  return (
    <StudioGate>
      <Voices />
    </StudioGate>
  );
}

async function fileToPayload(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { filename: file.name, mime: file.type || "audio/webm", b64: btoa(binary) };
}

function Voices() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["suno-status"], queryFn: () => sunoStatus() });
  const list = useQuery({ queryKey: ["eleven-voices"], queryFn: () => elevenVoices() });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [speakId, setSpeakId] = useState<string | null>(null);
  const [line, setLine] = useState("This is my voice on the track.");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const clone = useMutation({
    mutationFn: async () => {
      const payloads = await Promise.all(files.map(fileToPayload));
      return elevenClone({
        data: { confirmation: "EXECUTE", name, description, files: payloads },
      });
    },
    onSuccess: () => {
      setName("");
      setDescription("");
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ["eleven-voices"] });
      void qc.invalidateQueries({ queryKey: ["suno-status"] });
      toast.success("Voice cloned server-side");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => elevenDeleteVoice({ data: { confirmation: "EXECUTE", id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["eleven-voices"] });
      toast.success("Voice removed");
    },
  });

  const speak = useMutation({
    mutationFn: () => elevenSpeak({ data: { voiceId: speakId!, text: line } }),
    onSuccess: (res) => {
      const audio = new Audio(res.audio_url);
      void audio.play();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function toggleRecord() {
    if (recording) {
      rec.current?.stop();
      setRecording(false);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunks.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
      const file = new File([blob], `take-${Date.now()}.webm`, { type: blob.type });
      setFiles((prev) => [...prev, file]);
      stream.getTracks().forEach((t) => t.stop());
    };
    rec.current = recorder;
    recorder.start();
    setRecording(true);
  }

  const eleven = status.data?.eleven;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6 md:px-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">ElevenLabs · Instant clone</p>
        <h1 className="font-display text-3xl tracking-tight">Voices</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Clone a voice from a short take, then inject it into a Suno vocal stem. The ElevenLabs
          key stays in the vault. Samples never go to ChatGPT.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={eleven?.authenticated ? "ok" : "warn"}>
          {eleven?.authenticated ? "ElevenLabs connected" : "Add key in Vault"}
        </Badge>
        <Badge>
          {status.data?.usage.eleven_clones ?? 0}/{status.data?.usage.clone_ceiling ?? 6} clones
        </Badge>
        <Badge>
          {status.data?.usage.eleven_injects ?? 0}/{status.data?.usage.inject_ceiling ?? 8} injects
        </Badge>
      </div>

      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          clone.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="vname">Name</Label>
          <Input id="vname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Booth take" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vdesc">Notes</Label>
          <Textarea
            id="vdesc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dry, close mic, spoken then sung"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center rounded-sm border border-border bg-surface-2 px-3 text-sm">
            Upload samples
            <input
              type="file"
              accept="audio/*"
              multiple
              className="sr-only"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          <Button type="button" variant="secondary" onClick={() => void toggleRecord()}>
            {recording ? <Square className="size-3.5" /> : <Mic className="size-3.5" />}
            {recording ? "Stop" : "Record"}
          </Button>
        </div>
        {files.length ? (
          <ul className="text-xs text-muted">
            {files.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-subtle">1–3 minutes of clean audio. Up to 4 files, 8MB each.</p>
        )}
        <Button type="submit" disabled={!name.trim() || !files.length || clone.isPending}>
          {clone.isPending ? "Cloning…" : "Clone voice"}
        </Button>
      </form>

      <ul className="space-y-2">
        {(list.data ?? []).map((v) => (
          <li key={v.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{v.name}</p>
                <p className="text-xs text-muted">{v.description || "No notes"}</p>
              </div>
              <Badge tone="ok">{v.status}</Badge>
            </div>
            {speakId === v.id ? (
              <div className="mt-3 space-y-2">
                <Textarea rows={2} value={line} onChange={(e) => setLine(e.target.value)} />
                <Button type="button" size="sm" disabled={speak.isPending} onClick={() => speak.mutate()}>
                  {speak.isPending ? "Speaking…" : "Preview speech"}
                </Button>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {v.sample_url ? (
                <audio controls src={v.sample_url} className="h-10 max-w-full" />
              ) : null}
              <Button type="button" size="sm" variant="secondary" onClick={() => setSpeakId(v.id)}>
                Speak lyrics
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => del.mutate(v.id)}>
                Remove
              </Button>
            </div>
          </li>
        ))}
        {!list.isPending && !list.data?.length ? (
          <li className="text-sm text-muted">No clones yet. Record a take above.</li>
        ) : null}
      </ul>
    </div>
  );
}
