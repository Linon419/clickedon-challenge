import { extractJson } from "./extract-json";
import { mockStream, type MockBehavior, type MockState } from "./anthropic-mock";

export interface GenerateInput {
  /** Drives the mock streaming client (see anthropic-mock.ts). */
  behavior: MockBehavior;
  /** Hands the finished draft to the next pipeline stage. May reject. */
  advanceToNextStage: () => Promise<void>;
  /** Returns true once the draft passes review. Scripted by callers/tests. */
  reviewPasses: (attempt: number) => boolean;
}

export interface GenerateResult {
  status: "ok" | "error";
  attempts: number;
}

const MAX_REVISIONS = 3;
const MAX_MODEL_ATTEMPTS = 3;

function isRetryableModelError(error: unknown): boolean {
  if (error instanceof SyntaxError) {
    return true;
  }

  if (error instanceof Error && error.message.includes("No fenced JSON block")) {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 429
  );
}

async function streamAndExtractJson(
  behavior: MockBehavior,
  state: MockState,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt += 1) {
    try {
      const text = await mockStream(behavior, state);
      extractJson(text);
      return;
    } catch (error) {
      if (attempt === MAX_MODEL_ATTEMPTS || !isRetryableModelError(error)) {
        throw error;
      }
    }
  }
}

/**
 * Runs one content-generation pass: stream a draft, extract it, revise until it
 * passes review, then hand off to the next stage.
 *
 * This is a faithful (stripped-down) reproduction of the real pipeline — and it
 * ships with three real bugs from that pipeline. Your job is to fix them so the
 * test suite passes. See the README for the symptoms. (Do not edit the tests.)
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const state: MockState = { calls: 0 };

  // The model call can fail transiently (rate limits) or return a truncated
  // stream. Retry those bounded, recoverable model failures before failing.
  try {
    await streamAndExtractJson(input.behavior, state);
  } catch {
    return { status: "error", attempts: 0 };
  }

  // Revise until the draft passes review.
  let attempt = 0;
  while (!input.reviewPasses(attempt)) {
    if (attempt >= MAX_REVISIONS) {
      return { status: "error", attempts: attempt };
    }
    attempt += 1;
  }

  // Kick off the next stage and return.
  try {
    await input.advanceToNextStage();
  } catch {
    return { status: "error", attempts: attempt };
  }

  return { status: "ok", attempts: attempt };
}

export { MAX_REVISIONS };
