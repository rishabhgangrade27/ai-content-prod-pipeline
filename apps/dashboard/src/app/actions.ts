"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as api from "@/lib/api";

export async function createJobAction(formData: FormData) {
  const brief = String(formData.get("brief") ?? "").trim();
  const format = String(formData.get("format") ?? "VERTICAL");
  if (!brief) {
    throw new Error("Brief is required");
  }

  const job = await api.createJob({ brief, format });
  revalidatePath("/");
  redirect(`/jobs/${job.id}`);
}

// `decision` is bound per-button via reviewAction.bind(null, "APPROVED"/"REJECTED")
// rather than read from a button name/value pair — Next's Server Actions
// machinery rewrites a submitter button's `name` to its own internal
// $ACTION_ID_... dispatch key, silently clobbering any name we set ourselves.
export async function reviewAction(decision: "APPROVED" | "REJECTED", formData: FormData) {
  const jobId = String(formData.get("jobId"));
  const reviewer = String(formData.get("reviewer") ?? "").trim() || "dashboard-user";
  const comment = String(formData.get("comment") ?? "").trim();

  await api.reviewJob(jobId, decision, reviewer, comment);
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function regenerateAction(formData: FormData) {
  const jobId = String(formData.get("jobId"));
  await api.regenerateJob(jobId);
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}
