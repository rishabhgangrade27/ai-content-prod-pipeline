const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";

export interface Scene {
  id: string;
  order: number;
  scriptText: string | null;
  visualPrompt: string | null;
  status: string;
}

export interface Asset {
  id: string;
  sceneId: string | null;
  type: string;
  provider: string | null;
  url: string | null;
  status: string;
}

export interface Attempt {
  id: string;
  gateName: string;
  subjectType: string;
  subjectId: string;
  attemptNumber: number;
  verdict: string | null;
  feedback: string | null;
  costUsd: string | null;
  createdAt: string;
}

export interface Review {
  id: string;
  reviewer: string;
  decision: string;
  comment: string | null;
  createdAt: string;
}

export interface CostEvent {
  id: string;
  stage: string;
  provider: string;
  units: string;
  usdEstimate: string;
}

export interface JobSummary {
  id: string;
  brief: string;
  script: string | null;
  format: string;
  status: string;
  deliveryTarget: string | null;
  latestError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetail extends JobSummary {
  scenes: Scene[];
  assets: Asset[];
  attempts: Attempt[];
  reviews: Review[];
  costEvents: CostEvent[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `API returned ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
}

export function listJobs(status?: string): Promise<JobSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/jobs${query}`);
}

export function getJob(jobId: string): Promise<JobDetail> {
  return request(`/jobs/${jobId}`);
}

export function createJob(input: { brief: string; format: string }): Promise<JobSummary> {
  return request("/jobs", { method: "POST", body: JSON.stringify(input) });
}

export function reviewJob(
  jobId: string,
  decision: "APPROVED" | "REJECTED",
  reviewer: string,
  comment?: string,
): Promise<{ job: JobSummary }> {
  return request(`/jobs/${jobId}/review`, {
    method: "POST",
    body: JSON.stringify({ decision, reviewer, comment: comment || undefined }),
  });
}

export function regenerateJob(jobId: string): Promise<JobSummary> {
  return request(`/jobs/${jobId}/regenerate`, { method: "POST" });
}
