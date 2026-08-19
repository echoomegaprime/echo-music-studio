import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { StudioGate } from "@/components/studio-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sunoClearVault, sunoSaveVault, sunoStatus } from "@/lib/suno/api";

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
      toast.success("Vault cleared");
    },
  });

  const s = status.data;

  return (
    <div className="mx-auto max-w-xl space-y-8 px-4 py-6 md:px-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Providers / suno / production</p>
        <h1 className="font-display text-3xl tracking-tight">Vault</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Paste the API credential for the Suno Platform account tied to your Suno login. It is
          encrypted at rest and never returned to the browser or the model. Generations run under
          your account, not a shared Echo pool.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={s?.provider_authenticated ? "ok" : "warn"}>
          {s?.provider_authenticated ? "Authenticated" : "Not connected"}
        </Badge>
        {s?.hint ? <Badge>Hint {s.hint}</Badge> : null}
        <Badge tone={s?.ai_available ? "ok" : "muted"}>
          {s?.ai_available ? "Architect online" : "Architect local"}
        </Badge>
      </div>

      {s?.last_error ? <p className="text-sm text-danger">{s.last_error}</p> : null}

      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="base">Provider base URL</Label>
          <Input
            id="base"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoComplete="off"
          />
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
            {save.isPending ? "Checking…" : "Save to vault"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => clear.mutate()} disabled={clear.isPending}>
            Remove credential
          </Button>
        </div>
      </form>

      <div className="space-y-2 text-sm text-muted">
        <p>
          Daily ceiling: {s?.usage.suno_generates ?? 0}/{s?.usage.suno_ceiling ?? 8} Suno
          generations, {s?.usage.sketches ?? 0}/{s?.usage.sketch_ceiling ?? 24} sketches.
        </p>
        <p>
          Official Suno Platform billing may be a separate pool from the consumer web
          subscription. Confirm in your Platform account. There is no raw HTTP proxy and no
          rollback after a paid generate.
        </p>
      </div>
    </div>
  );
}
