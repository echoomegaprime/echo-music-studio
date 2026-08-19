import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { StudioGate } from "@/components/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  elevenClearVault,
  elevenSaveVault,
  sunoClearVault,
  sunoSaveVault,
  sunoStatus,
} from "@/lib/suno/api";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <StudioGate>
      <Vault />
    </StudioGate>
  );
}

function Vault() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["suno-status"], queryFn: () => sunoStatus() });
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.sunoapi.org");
  const [elevenKey, setElevenKey] = useState("");
  const save = useMutation({
    mutationFn: () => sunoSaveVault({ data: { apiKey, baseUrl } }),
    onSuccess: (res) => {
      setApiKey("");
      void qc.invalidateQueries({ queryKey: ["suno-status"] });
      if (res.authenticated) toast.success("Suno credential stored server-side");
      else toast.error(res.error || "Credential saved, provider rejected it");
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const clear = useMutation({
    mutationFn: () => sunoClearVault(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["suno-status"] });
      toast.success("Suno vault cleared");
    },
  });
  const saveEleven = useMutation({
    mutationFn: () => elevenSaveVault({ data: { apiKey: elevenKey } }),
    onSuccess: (res) => {
      setElevenKey("");
      void qc.invalidateQueries({ queryKey: ["suno-status"] });
      if (res.authenticated) toast.success("ElevenLabs key stored server-side");
      else toast.error(res.error || "ElevenLabs rejected the key");
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const clearEleven = useMutation({
    mutationFn: () => elevenClearVault(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["suno-status"] });
      toast.success("ElevenLabs vault cleared");
    },
  });

  const s = status.data;
  const caps = s?.capabilities;

  return (
    <div className="mx-auto max-w-xl space-y-8 px-4 py-6 md:px-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Providers / production</p>
        <h1 className="font-display text-3xl tracking-tight">Vault</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Suno and ElevenLabs credentials are encrypted at rest and never returned to the browser
          or the model. Generations and clones run under your accounts.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={s?.provider_authenticated ? "ok" : "warn"}>
          {s?.provider_authenticated ? "Suno on" : "Suno off"}
        </Badge>
        <Badge tone={s?.eleven.authenticated ? "ok" : "warn"}>
          {s?.eleven.authenticated ? "ElevenLabs on" : "ElevenLabs off"}
        </Badge>
        {s?.hint ? <Badge>Suno {s.hint}</Badge> : null}
        {s?.eleven.hint ? <Badge>EL {s.eleven.hint}</Badge> : null}
        <Badge tone={s?.ai_available ? "ok" : "muted"}>
          {s?.ai_available ? "Architects online" : "Architect local"}
        </Badge>
        {s?.architects.grok ? <Badge tone="ok">Grok</Badge> : <Badge>Grok</Badge>}
        {s?.architects.gpt ? <Badge tone="ok">GPT</Badge> : <Badge>GPT</Badge>}
        {s?.architects.claude ? <Badge tone="ok">Claude</Badge> : <Badge>Claude</Badge>}
        {s?.architects.qwen ? <Badge tone="ok">Qwen</Badge> : <Badge>Qwen</Badge>}
      </div>

      {s?.last_error ? <p className="text-sm text-danger">{s.last_error}</p> : null}
      {s?.eleven.last_error ? <p className="text-sm text-danger">{s.eleven.last_error}</p> : null}

      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Suno Platform</p>
        <div className="space-y-1.5">
          <Label htmlFor="base">Provider base URL</Label>
          <Input id="base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="key">Suno API credential</Label>
          <Input
            id="key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Bearer token — stored server-side only"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!apiKey.trim() || save.isPending}>
            {save.isPending ? "Checking…" : "Save Suno"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => clear.mutate()} disabled={clear.isPending}>
            Remove
          </Button>
        </div>
      </form>

      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveEleven.mutate();
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">ElevenLabs</p>
        <div className="space-y-1.5">
          <Label htmlFor="el">API key</Label>
          <Input
            id="el"
            type="password"
            value={elevenKey}
            onChange={(e) => setElevenKey(e.target.value)}
            placeholder="xi-api-key — stored server-side only"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!elevenKey.trim() || saveEleven.isPending}>
            {saveEleven.isPending ? "Checking…" : "Save ElevenLabs"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => clearEleven.mutate()}
            disabled={clearEleven.isPending}
          >
            Remove
          </Button>
        </div>
      </form>

      {caps ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Suno abilities</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {(
              [
                ["generate", caps.generate],
                ["cover", caps.cover],
                ["extend", caps.extend],
                ["mashup", caps.mashup],
                ["add vocals", caps.add_vocals],
                ["add instrumental", caps.add_instrumental],
                ["stems", caps.stems],
                ["lyrics", caps.lyrics],
                ["wav", caps.wav],
                ["video", caps.video],
                ["persona", caps.persona],
                ["boost style", caps.boost_style],
              ] as const
            ).map(([label, on]) => (
              <li key={label} className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2">
                <span>{label}</span>
                <Badge tone={on ? "ok" : "muted"}>{on ? "on" : "off"}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2 text-sm text-muted">
        <p>
          Daily ceiling: {s?.usage.suno_generates ?? 0}/{s?.usage.suno_ceiling ?? 8} Suno,{" "}
          {s?.usage.suno_tools ?? 0}/{s?.usage.tool_ceiling ?? 16} tools, {s?.usage.sketches ?? 0}/
          {s?.usage.sketch_ceiling ?? 24} sketches, {s?.usage.eleven_clones ?? 0}/
          {s?.usage.clone_ceiling ?? 6} clones.
        </p>
        <p>
          Suno Platform billing may be a separate pool from the consumer web subscription. There is
          no raw HTTP proxy and no rollback after a paid generate.
        </p>
      </div>
    </div>
  );
}
