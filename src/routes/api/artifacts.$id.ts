import { createFileRoute } from "@tanstack/react-router";
import { loadArtifact } from "@/lib/suno/engine.server";

export const Route = createFileRoute("/api/artifacts/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const art = await loadArtifact(params.id);
        if (!art) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(Buffer.from(art.bytes), {
          status: 200,
          headers: {
            "content-type": art.mime,
            "cache-control": "private, max-age=3600",
            "content-disposition": "inline",
          },
        });
      },
    },
  },
});
