const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";

export interface JobSummary {
  id: string;
  brief: string;
  script: string | null;
  format: string;
  status: string;
  deliveryTarget: string | null;
  webhookUrl: string | null;
  latestError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetail extends JobSummary {
  scenes: Array<{ id: string; order: number; scriptText: string | null; status: string }>;
  assets: Array<{ id: string; type: string; url: string | null; status: string }>;
  attempts: Array<{ gateName: string; attemptNumber: number; verdict: string | null; feedback: string | null }>;
  reviews: Array<{ reviewer: string; decision: string; comment: string | null; createdAt: string }>;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Pipeline API returned ${status}: ${JSON.stringify(body)}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
}

export function createJob(input: { brief: string; format?: string }): Promise<JobSummary> {
  return request("/jobs", { method: "POST", body: JSON.stringify(input) });
}

export function getJob(jobId: string): Promise<JobDetail> {
  return request(`/jobs/${jobId}`);
}

export function listJobs(status?: string): Promise<JobSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/jobs${query}`);
}

export function reviewJob(
  jobId: string,
  decision: "APPROVED" | "REJECTED",
  reviewer: string,
  comment?: string,
): Promise<{ review: unknown; job: JobSummary }> {
  return request(`/jobs/${jobId}/review`, {
    method: "POST",
    body: JSON.stringify({ decision, reviewer, comment }),
  });
}

export function regenerateJob(jobId: string): Promise<JobSummary> {
  return request(`/jobs/${jobId}/regenerate`, { method: "POST" });
}
