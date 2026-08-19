import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { StudioGate } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sunoProjectCreate, sunoProjects } from "@/lib/suno/api";

export const Route = createFileRoute("/projects")({ component: ProjectsPage });

function ProjectsPage() {
  return (
    <StudioGate>
      <Projects />
    </StudioGate>
  );
}

function Projects() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["suno-projects"], queryFn: () => sunoProjects() });
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const create = useMutation({
    mutationFn: () =>
      sunoProjectCreate({ data: { confirmation: "EXECUTE", title, concept } }),
    onSuccess: () => {
      setTitle("");
      setConcept("");
      void qc.invalidateQueries({ queryKey: ["suno-projects"] });
      toast.success("Project created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 md:px-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Albums & catalogues</p>
        <h1 className="font-display text-3xl tracking-tight">Projects</h1>
      </div>

      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="ptitle">Title</Label>
          <Input
            id="ptitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Echo Prime Album"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pconcept">Concept</Label>
          <Textarea
            id="pconcept"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Seven songs about forging a sovereign machine in West Texas"
            rows={3}
          />
        </div>
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          Create project
        </Button>
      </form>

      <ul className="space-y-2">
        {(q.data ?? []).map((p) => (
          <li key={p.id}>
            <Link
              to="/project/$id"
              params={{ id: p.id }}
              className="block rounded-lg border border-border bg-surface px-4 py-3 hover:bg-surface-2"
            >
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-muted">
                {p.track_count} tracks · {p.concept || "No concept"}
              </p>
            </Link>
          </li>
        ))}
        {!q.isPending && !q.data?.length ? (
          <li className="text-sm text-muted">No projects yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
