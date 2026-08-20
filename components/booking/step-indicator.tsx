const STEP_LABELS = [
  "Service",
  "Details",
  "Photos",
  "Address",
  "Budget",
  "Schedule",
  "Your Info",
  "Confirm",
];

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <ol className="mb-8 flex flex-wrap gap-2 text-xs">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isComplete = stepNumber < currentStep;
        return (
          <li
            key={label}
            className={`rounded-full border px-3 py-1 ${
              isActive
                ? "border-accent bg-accent text-accent-foreground"
                : isComplete
                  ? "border-accent/50 text-accent"
                  : "border-border text-muted-foreground"
            }`}
          >
            {stepNumber}. {label}
          </li>
        );
      })}
    </ol>
  );
}
