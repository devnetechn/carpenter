import { describe, it, expect } from "vitest";
import { resolveAnswerLabels } from "@/lib/lead-answers";

describe("resolveAnswerLabels", () => {
  const questions = [
    { id: "q1", label: "Existing deck?" },
    { id: "q2", label: "Dimensions" },
    { id: "q3", label: "Unanswered question" },
  ];

  it("pairs answers with their question labels, in question order", () => {
    const result = resolveAnswerLabels(questions, { q2: "20x14", q1: "yes" });
    expect(result).toEqual([
      { label: "Existing deck?", value: "yes" },
      { label: "Dimensions", value: "20x14" },
    ]);
  });

  it("ignores answers with no matching question", () => {
    const result = resolveAnswerLabels(questions, { q1: "yes", stray: "orphan" });
    expect(result).toEqual([{ label: "Existing deck?", value: "yes" }]);
  });

  it("returns an empty array when there are no answers", () => {
    expect(resolveAnswerLabels(questions, {})).toEqual([]);
  });
});
