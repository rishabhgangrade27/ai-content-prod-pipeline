import Link from "next/link";
import { listJobs } from "@/lib/api";
import { statusVariant } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";

const STATUS_TABS = ["ALL", "REVIEW", "FAILED", "APPROVED", "DELIVERED"] as const;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeTab = status && (STATUS_TABS as readonly string[]).includes(status) ? status : "ALL";
  const jobs = await listJobs(activeTab === "ALL" ? undefined : activeTab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-[3px] w-fit">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={tab === "ALL" ? "/" : `/?status=${tab}`}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab}
          </Link>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brief</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No jobs in this view yet.
              </TableCell>
            </TableRow>
          )}
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="max-w-md">
                <Link href={`/jobs/${job.id}`} className="hover:underline">
                  {job.brief}
                </Link>
              </TableCell>
              <TableCell>{job.format}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(job.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
