import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardData } from "@/components/booking/types";

export function StepBudget({
  data,
  updateData,
  goNext,
  goBack,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">What&apos;s your estimated budget?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This helps us tailor recommendations. It&apos;s okay to estimate.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="budgetMin">Minimum ($)</Label>
          <Input
            id="budgetMin"
            type="number"
            value={data.budgetMin}
            onChange={(e) => updateData({ budgetMin: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budgetMax">Maximum ($)</Label>
          <Input
            id="budgetMax"
            type="number"
            value={data.budgetMax}
            onChange={(e) => updateData({ budgetMax: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button onClick={goNext}>Continue</Button>
      </div>
    </div>
  );
}
