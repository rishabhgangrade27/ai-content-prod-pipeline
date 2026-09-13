import { createJobAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function NewJobPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">New job</h1>

      <Card>
        <CardHeader>
          <CardTitle>Creative brief</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createJobAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="brief">Brief</Label>
              <Textarea
                id="brief"
                name="brief"
                required
                rows={4}
                placeholder="15s vertical UGC ad for a reusable water bottle"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="format">Format</Label>
              {/* Plain native select — guarantees correct FormData submission
                  without relying on a headless component library's form
                  integration for a simple three-option field. */}
              <select
                id="format"
                name="format"
                defaultValue="VERTICAL"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="VERTICAL">Vertical (9:16)</option>
                <option value="LANDSCAPE">Landscape (16:9)</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
            <Button type="submit">Create job</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
