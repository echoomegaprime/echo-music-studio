import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, AudioLines, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  elevenVoices,
  sunoArchitect,
  sunoBoostStyle,
  sunoGenerate,
  sunoGetDraft,
  sunoSaveDraft,
  sunoStatus,
} from "@/lib/suno/api";
import { newChatMessage } from "@/lib/suno/chat";
import type { ArchitectModel, ChatMessage, GenerateControls, SongSpec, SunoModel } from "@/lib/suno/types";
import { ARCHITECT_MODELS, SUNO_MODELS } from "@/lib/suno/types";
import { usePlayerStore } from "@/lib/player-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function newKey() {
  return crypto.randomUUID();
}

const STARTERS = [
  { kicker: "Outlaw", line: "Country about building Echo in West Texas dust" },
  { kicker: "Cinematic", line: "Southern rock. A machine that learned to pray." },
  { kicker: "After hours", line: "R&B. Two voices that will not say the word." },
  { kicker: "Score", line: "Instrumental desert cue. No vocals. Wide and slow." },
];

const ARCHITECT_LABEL: Record<ArchitectModel, string> = {
  grok: "Grok",
  gpt: "GPT",
  claude: "Claude",
  qwen: "Qwen",
};

export function ComposePanel() {
  const qc = useQueryClient();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const statusQ = useQuery({ queryKey: ["suno-status"], queryFn: () => sunoStatus() });
  const draftQ = useQuery({ queryKey: ["suno-draft"], queryFn: () => sunoGetDraft() });
  const voicesQ = useQuery({ queryKey: ["eleven-voices"], queryFn: () => elevenVoices() });
  const [idea, setIdea] = useState("");
  const [draft, setDraft] = useState("");
  const [spec, setSpec] = useState<SongSpec | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<"suno" | "sketch">("sketch");
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<SunoModel>("V5_5");
  const [architectModel, setArchitectModel] = useState<ArchitectModel>("grok");
  const [vocalGender, setVocalGender] = useState<"m" | "f" | "">("");
  const [voiceId, setVoiceId] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const connected = Boolean(statusQ.data?.provider_authenticated);
  const elevenOn = Boolean(statusQ.data?.eleven.authenticated);
  const architects = statusQ.data?.architects;
  const usage = statusQ.data?.usage;
  const lastSpec = [...messages].reverse().find((m) => m.spec)?.spec ?? spec;

  useEffect(() => {
    if (!draftQ.data || hydrated) return;
    setIdea(draftQ.data.idea);
    setSpec(draftQ.data.spec);
    setMessages(draftQ.data.messages ?? []);
    setHydrated(true);
  }, [draftQ.data, hydrated]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, spec]);

  useEffect(() => {
    const live = ARCHITECT_MODELS.find((m) => architects?.[m]);
    if (live && !architects?.[architectModel]) setArchitectModel(live);
  }, [architects, architectModel]);

  const architect = useMutation({
    mutationFn: async (text: string) => {
      const user = newChatMessage("user", text);
      const next = [...messages, user];
      setMessages(next);
      setDraft("");
      return sunoArchitect({ data: { idea: text, messages: next, model: architectModel } });
    },
    onSuccess: (res) => {
      setMessages(res.messages);
      setSpec(res.spec);
      setIdea(res.messages.filter((m) => m.role === "user").at(-1)?.content ?? idea);
      if (res.spec) setInstrumental(res.spec.instrumental);
      void qc.invalidateQueries({ queryKey: ["suno-draft"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const boost = useMutation({
    mutationFn: async () => {
      if (!lastSpec) throw new Error("Need a spec first");
      const style = [...lastSpec.production.genre, ...lastSpec.production.mood].join(", ");
      return sunoBoostStyle({ data: { content: style } });
    },
    onSuccess: (res) => toast.success(res.result.slice(0, 140)),
    onError: (err: Error) => toast.error(err.message),
  });

  const generate = useMutation({
    mutationFn: () => {
      if (!lastSpec) throw new Error("Architect a song first");
      const controls: GenerateControls = {
        model,
        vocalGender: vocalGender || undefined,
      };
      const ready: SongSpec = { ...lastSpec, instrumental };
      return sunoGenerate({
        data: {
          confirmation: "EXECUTE",
          idempotency_key: newKey(),
          spec: ready,
          mode,
          action: mode === "sketch" ? "sketch" : "generate",
          controls,
          voice_id: voiceId || null,
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

  function send(text = draft) {
    const trimmed = text.trim();
    if (!trimmed || architect.isPending) return;
    architect.mutate(trimmed);
  }

  function patchSpec(partial: Partial<SongSpec>) {
    if (!lastSpec) return;
    const next = { ...lastSpec, ...partial };
    setSpec(next);
    void sunoSaveDraft({ data: { idea, spec: next, messages } });
  }

  function resetRoom() {
    setMessages([]);
    setSpec(null);
    setIdea("");
    setDraft("");
    void sunoSaveDraft({ data: { idea: "", spec: null, messages: [] } });
    inputRef.current?.focus();
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <p className="kicker">Control room</p>
          <h2 className="font-display text-3xl tracking-tight">Write with Echo</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ARCHITECT_MODELS.map((m) => (
            <Badge key={m} tone={architects?.[m] ? "ok" : "muted"}>
              {ARCHITECT_LABEL[m]}
            </Badge>
          ))}
          {connected ? <Badge tone="ok">Suno</Badge> : <Badge tone="warn">Suno empty</Badge>}
          {elevenOn ? <Badge tone="ok">Voices</Badge> : <Badge>No clone</Badge>}
          {usage ? (
            <Badge className="tabular-nums">
              {usage.suno_generates}/{usage.suno_ceiling}
            </Badge>
          ) : null}
          {messages.length ? (
            <Button type="button" size="sm" variant="ghost" onClick={resetRoom}>
              <Plus className="size-3.5" />
              New
            </Button>
          ) : null}
        </div>
      </header>

      <div
        ref={scroller}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
      >
        {messages.length === 0 ? (
          <EmptyChat onPick={send} pending={architect.isPending} />
        ) : (
          messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              onGenerate={() => setOpen(true)}
              onPatch={patchSpec}
            />
          ))
        )}
        {architect.isPending ? <TypingLine /> : null}
      </div>

      <div className="shrink-0 pt-4">
        {lastSpec ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mb-2 flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
          >
            <span className="min-w-0 truncate text-sm">
              <span className="text-muted">Ready · </span>
              {lastSpec.title}
            </span>
            <span className="ml-3 inline-flex items-center gap-1.5 text-xs text-muted">
              <AudioLines className="size-3.5" />
              Generate
            </span>
          </button>
        ) : null}

        <div className="rounded-xl border border-border bg-surface p-2">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Talk to Grok, GPT, Claude, or Qwen — story, voice, temperature."
            rows={2}
            autoFocus
            className="min-h-16 resize-none rounded-lg border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
            <div className="flex flex-wrap gap-1">
              {ARCHITECT_MODELS.map((m) => {
                const on = Boolean(architects?.[m]);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!on}
                    onClick={() => setArchitectModel(m)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors duration-150",
                      architectModel === m && on
                        ? "bg-accent text-accent-fg"
                        : on
                          ? "bg-surface-2 text-muted hover:text-fg"
                          : "text-subtle opacity-40",
                    )}
                  >
                    {ARCHITECT_LABEL[m]}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              size="icon"
              className="rounded-full"
              disabled={!draft.trim() || architect.isPending}
              onClick={() => send()}
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Confirm generation" className="w-[min(92vw,520px)]">
          <div className="space-y-4 text-sm">
            <p className="text-muted">
              {connected
                ? "Render through your Suno account, or keep it local as an Echo sketch."
                : "Suno is not connected. You can still render a local studio sketch."}
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setMode("suno")}
                disabled={!connected}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left transition-colors duration-150",
                  mode === "suno" ? "border-accent bg-surface-2" : "border-border",
                  "disabled:opacity-40",
                )}
              >
                <span className="block font-medium">Suno account</span>
                <span className="text-xs text-muted">Uses your credits. Two variants. Irreversible.</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("sketch")}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left transition-colors duration-150",
                  mode === "sketch" ? "border-accent bg-surface-2" : "border-border",
                )}
              >
                <span className="block font-medium">Echo sketch</span>
                <span className="text-xs text-muted">Local structure preview. Not a Suno render.</span>
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="model">Model</Label>
                <select
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value as SunoModel)}
                  className="flex h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm"
                >
                  {SUNO_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gender">Vocal</Label>
                <select
                  id="gender"
                  value={vocalGender}
                  onChange={(e) => setVocalGender(e.target.value as "m" | "f" | "")}
                  className="flex h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm"
                >
                  <option value="">From spec</option>
                  <option value="m">Male</option>
                  <option value="f">Female</option>
                </select>
              </div>
            </div>
            <label className="flex h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={instrumental}
                onChange={(e) => setInstrumental(e.target.checked)}
              />
              Instrumental only
            </label>
            {voicesQ.data?.length ? (
              <div className="space-y-1.5">
                <Label htmlFor="voice">Cloned voice (inject after render)</Label>
                <select
                  id="voice"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="flex h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm"
                >
                  <option value="">Keep Suno vocal</option>
                  {voicesQ.data.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-subtle">
                  After Suno finishes, open the track and run Inject to replace the vocal stem.
                </p>
              </div>
            ) : null}
            <div className="flex gap-2">
              {connected ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!lastSpec || boost.isPending}
                  onClick={() => boost.mutate()}
                >
                  Boost style
                </Button>
              ) : null}
              <Button
                type="button"
                className="flex-1"
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
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EmptyChat({ onPick, pending }: { onPick: (t: string) => void; pending: boolean }) {
  return (
    <div className="flex h-full min-h-72 flex-col justify-end gap-10 py-4">
      <div className="chat-enter-slow max-w-lg">
        <p className="kicker">The room is live</p>
        <h3 className="mt-3 font-display text-3xl leading-tight tracking-tight md:text-4xl">
          What should we write.
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          Compose with Grok, GPT, Claude, or Qwen. Echo drafts the spec and lyrics. Suno sings
          it — optionally in a voice you cloned.
        </p>
      </div>
      <div className="starter-stagger grid gap-2 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s.line}
            type="button"
            disabled={pending}
            onClick={() => onPick(`${s.kicker}. ${s.line}`)}
            className="rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 disabled:opacity-40"
          >
            <span className="kicker">{s.kicker}</span>
            <span className="mt-1.5 block text-sm leading-snug text-fg">{s.line}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TypingLine() {
  return (
    <div className="chat-enter flex items-start gap-3">
      <span className="tally mt-1.5" />
      <div>
        <p className="kicker">Echo</p>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted">
          <span className="echo-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span>Listening to the room</span>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  onGenerate,
  onPatch,
}: {
  message: ChatMessage;
  onGenerate: () => void;
  onPatch: (p: Partial<SongSpec>) => void;
}) {
  const mine = message.role === "user";
  if (mine) {
    return (
      <div className="chat-enter flex justify-end">
        <div className="max-w-[min(100%,28rem)] rounded-xl rounded-br-sm bg-surface-2 px-4 py-3">
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="chat-enter flex items-start gap-3">
      <span className="tally mt-1.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="kicker">Echo</p>
        <p className="max-w-xl text-sm leading-relaxed text-fg">{message.content}</p>
        {message.spec ? (
          <SongCard spec={message.spec} onGenerate={onGenerate} onPatch={onPatch} />
        ) : null}
      </div>
    </div>
  );
}

function SongCard({
  spec,
  onGenerate,
  onPatch,
}: {
  spec: SongSpec;
  onGenerate: () => void;
  onPatch: (p: Partial<SongSpec>) => void;
}) {
  const [openLyrics, setOpenLyrics] = useState(false);
  return (
    <div className="max-w-xl rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker">Lead sheet</p>
          <h3 className="mt-1 font-display text-2xl tracking-tight">{spec.title}</h3>
        </div>
        <Button type="button" size="sm" onClick={onGenerate}>
          <AudioLines className="size-3.5" />
          Generate
        </Button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="kicker">Vocal</dt>
          <dd className="mt-1 text-muted">{spec.vocal.character}</dd>
        </div>
        <div>
          <dt className="kicker">Tempo</dt>
          <dd className="mt-1 capitalize text-muted">{spec.production.tempo}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="kicker">Genre</dt>
          <dd className="mt-1 text-muted">{spec.production.genre.slice(0, 2).join(" · ")}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {spec.structure.map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-surface-2 p-3">
        <button
          type="button"
          className="kicker hover:text-fg"
          onClick={() => setOpenLyrics((v) => !v)}
        >
          {openLyrics ? "Close lyrics" : "Lyrics"}
        </button>
        {openLyrics ? (
          <Textarea
            className="mt-2 min-h-48 rounded-md border-0 bg-bg font-mono text-xs leading-relaxed"
            value={spec.lyrics}
            onChange={(e) => onPatch({ lyrics: e.target.value })}
          />
        ) : (
          <LyricsPreview lyrics={spec.lyrics} />
        )}
      </div>
    </div>
  );
}

function LyricsPreview({ lyrics }: { lyrics: string }) {
  const parts = lyrics.split(/(\[[^\]]+\])/g).filter(Boolean);
  return (
    <div className="mt-2 max-h-40 overflow-hidden text-sm leading-relaxed">
      {parts.slice(0, 12).map((part, i) =>
        part.startsWith("[") ? (
          <p key={`${part}-${i}`} className="mt-2 first:mt-0 font-medium text-xs uppercase tracking-widest text-subtle">
            {part}
          </p>
        ) : (
          <p key={`${part.slice(0, 12)}-${i}`} className="whitespace-pre-wrap text-muted">
            {part.trim()}
          </p>
        ),
      )}
    </div>
  );
}
