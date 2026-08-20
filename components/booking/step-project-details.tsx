import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceOption, WizardData } from "@/components/booking/types";

export function StepProjectDetails({
  service,
  data,
  updateData,
  goNext,
  goBack,
}: {
  service: ServiceOption;
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  function setAnswer(questionId: string, value: string) {
    updateData({ answers: { ...data.answers, [questionId]: value } });
  }

  const missingRequired = service.questions.some(
    (q) => q.required && !data.answers[q.id]
  );

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Tell us about the project</h1>
      <div className="mt-6 space-y-5">
        {service.questions.map((question) => (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={question.id}>
              {question.label}
              {question.required && " *"}
            </Label>
            {question.fieldType === "TEXTAREA" ? (
              <Textarea
                id={question.id}
                value={data.answers[question.id] ?? ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
              />
            ) : question.fieldType === "SELECT" ? (
              <select
                id={question.id}
                value={data.answers[question.id] ?? ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {(question.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : question.fieldType === "BOOLEAN" ? (
              <select
                id={question.id}
                value={data.answers[question.id] ?? ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <Input
                id={question.id}
                type={question.fieldType === "NUMBER" ? "number" : "text"}
                value={data.answers[question.id] ?? ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button disabled={missingRequired} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
