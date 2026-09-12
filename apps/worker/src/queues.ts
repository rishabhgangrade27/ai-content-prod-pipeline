export const QUEUE_NAMES = {
  script: "script",
  scenePlan: "scene-plan",
  image: "image",
  tts: "tts",
  music: "music",
  renderPrep: "render-prep",
  render: "render",
} as const;

/** Real per-stage retry/backoff — every job type gets its own tolerance for flaky provider APIs. */
export const RETRY_OPTS = {
  script: { attempts: 3, backoff: { type: "exponential" as const, delay: 5000 } },
  scenePlan: { attempts: 3, backoff: { type: "exponential" as const, delay: 5000 } },
  image: { attempts: 4, backoff: { type: "exponential" as const, delay: 3000 } },
  tts: { attempts: 3, backoff: { type: "exponential" as const, delay: 3000 } },
  music: { attempts: 2, backoff: { type: "exponential" as const, delay: 3000 } },
  renderPrep: { attempts: 1 },
  // Local compute, not a flaky network API — short fixed backoff is enough.
  render: { attempts: 2, backoff: { type: "fixed" as const, delay: 5000 } },
};
