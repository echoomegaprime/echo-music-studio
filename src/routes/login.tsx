import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user } = useCurrentUserState();
  if (user) return <Navigate to="/" />;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-5 py-10 text-fg">
      <img
        src="/og.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-bg/70" />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface/90 p-7">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Echo · Suno</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">Studio</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Compose with Grok, GPT, Claude, or Qwen. Clone a voice. Render through your Suno
          account. Credentials never leave the vault.
        </p>
        <div className="mt-6 space-y-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </div>
      </div>
    </main>
  );
}
