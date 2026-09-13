import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob, ApiError } from "@/lib/api";
import { statusVariant, formatUsd } from "@/lib/status";
import { reviewAction, regenerateAction } from "../../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let job;
  try {
    job = await getJob(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const finalAssets = job.assets.filter((a) => a.type === "FINAL" && a.url);
  const totalCost = job.costEvents.reduce((sum, c) => sum + Number.parseFloat(c.usdEstimate || "0"), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← All jobs
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{job.brief}</h1>
          <p className="text-sm text-muted-foreground">
            {job.id} · {job.format} · created {new Date(job.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge variant={statusVariant(job.status)} className="h-6 px-3 text-sm">
          {job.status}
        </Badge>
      </div>

      {job.latestError && (
        <Card className="border-destructive/40">
          <CardContent className="text-sm text-destructive">
            <strong>Error:</strong> {job.latestError}
          </CardContent>
        </Card>
      )}

      {job.script && (
        <Card>
          <CardHeader>
            <CardTitle>Script</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{job.script}</CardContent>
        </Card>
      )}

      {finalAssets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Final render{finalAssets.length > 1 ? "s" : ""}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {finalAssets.map((asset) => (
              <video key={asset.id} src={asset.url!} controls className="max-h-96 rounded-lg border" />
            ))}
          </CardContent>
        </Card>
      )}

      {job.scenes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scenes ({job.scenes.length})</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {job.scenes.map((scene) => {
              const image = job.assets.find((a) => a.sceneId === scene.id && a.type === "IMAGE");
              const audio = job.assets.find((a) => a.sceneId === scene.id && a.type === "AUDIO");
              return (
                <div key={scene.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Scene {scene.order}</span>
                    <Badge variant="outline">{scene.status}</Badge>
                  </div>
                  {image?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt={`Scene ${scene.order}`} className="w-full rounded-md" />
                  )}
                  <p className="text-sm text-muted-foreground">{scene.scriptText}</p>
                  {audio?.url && <audio src={audio.url} controls className="w-full" />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {job.attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>QA / retry history</CardTitle>
            <CardDescription>Every generation attempt, pass or fail, across every gate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {job.attempts.map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <Badge variant={a.verdict === "PASS" ? "outline" : "destructive"} className="mt-0.5 shrink-0">
                  {a.verdict ?? "—"}
                </Badge>
                <span>
                  <span className="font-medium">{a.gateName}</span> #{a.attemptNumber}
                  {a.feedback && <span className="text-muted-foreground"> — {a.feedback}</span>}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {job.costEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Estimated cost: {formatUsd(totalCost)}</CardTitle>
            <CardDescription>Per-stage cost estimates — see README for what&apos;s exact vs. approximate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {job.costEvents.map((c) => (
              <div key={c.id} className="flex justify-between">
                <span>
                  {c.stage} ({c.provider})
                </span>
                <span>{formatUsd(c.usdEstimate)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {job.status === "REVIEW" && (
        <Card>
          <CardHeader>
            <CardTitle>Review this job</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3">
              <input type="hidden" name="jobId" value={job.id} />
              <div className="space-y-1.5">
                <Label htmlFor="reviewer">Your name</Label>
                <Input id="reviewer" name="reviewer" placeholder="reviewer name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comment">Comment (optional)</Label>
                <Textarea id="comment" name="comment" placeholder="Why approve or reject?" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" formAction={reviewAction.bind(null, "APPROVED")}>
                  ✅ Approve
                </Button>
                <Button type="submit" formAction={reviewAction.bind(null, "REJECTED")} variant="destructive">
                  ❌ Reject
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {(job.status === "REJECTED" || job.status === "FAILED") && (
        <Card>
          <CardHeader>
            <CardTitle>Regenerate</CardTitle>
            <CardDescription>
              Wipes scenes/assets/QA history and restarts from script generation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={regenerateAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" variant="secondary">
                Regenerate from scratch
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {job.reviews.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Review history</p>
            {job.reviews.map((r) => (
              <p key={r.id}>
                {r.decision} by {r.reviewer} — {new Date(r.createdAt).toLocaleString()}
                {r.comment && ` — "${r.comment}"`}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
