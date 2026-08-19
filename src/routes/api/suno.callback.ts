import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/suno/callback")({
  server: {
    handlers: {
      POST: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      GET: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    },
  },
});
