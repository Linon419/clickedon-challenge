import { describe, expect, it, vi } from "vitest";
import { generate } from "../lib/pipeline";

describe("Pipeline edge cases", () => {
  it("does not advance when review never passes", async () => {
    const advanceToNextStage = vi.fn(async () => {
      /* hand-off succeeds */
    });

    const res = await generate({
      behavior: "ok",
      advanceToNextStage,
      reviewPasses: () => false,
    });

    expect(res.status).toBe("error");
    expect(advanceToNextStage).not.toHaveBeenCalled();
  });
});
