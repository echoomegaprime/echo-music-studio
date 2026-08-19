import { createFileRoute } from "@tanstack/react-router";
import { ComposePanel } from "@/components/studio/compose-panel";
import { NowPlaying } from "@/components/studio/now-playing";
import { StudioGate } from "@/components/studio-shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <StudioGate>
      <div className="mx-auto grid h-full min-h-0 max-w-6xl overflow-hidden lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <div className="flex min-h-0 flex-col px-4 py-5 md:px-8 md:py-6">
          <ComposePanel />
        </div>
        <aside className="hidden min-h-0 overflow-y-auto border-l border-border px-5 py-6 lg:block">
          <NowPlaying />
        </aside>
      </div>
    </StudioGate>
  );
}
