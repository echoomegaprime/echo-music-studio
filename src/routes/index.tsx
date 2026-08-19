import { createFileRoute } from "@tanstack/react-router";
import { ComposePanel } from "@/components/studio/compose-panel";
import { NowPlaying } from "@/components/studio/now-playing";
import { StudioGate } from "@/components/studio-shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <StudioGate>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-8 md:py-8">
        <ComposePanel />
        <NowPlaying />
      </div>
    </StudioGate>
  );
}
