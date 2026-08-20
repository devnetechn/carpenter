export interface AnswerEntry {
  label: string;
  value: string;
}

interface QuestionLike {
  id: string;
  label: string;
}

export function resolveAnswerLabels(
  questions: QuestionLike[],
  answers: Record<string, string>
): AnswerEntry[] {
  return questions
    .filter((q) => answers[q.id] !== undefined)
    .map((q) => ({ label: q.label, value: answers[q.id] }));
}
