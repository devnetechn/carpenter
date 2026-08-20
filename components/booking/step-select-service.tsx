import { Button } from "@/components/ui/button";
import type { ServiceOption, WizardData } from "@/components/booking/types";

export function StepSelectService({
  services,
  data,
  updateData,
  goNext,
}: {
  services: ServiceOption[];
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
}) {
  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">What do you need done?</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => updateData({ serviceId: service.id, serviceSlug: service.slug })}
            className={`rounded-lg border p-4 text-left text-sm transition-colors ${
              data.serviceId === service.id
                ? "border-accent bg-accent/10"
                : "hover:border-accent"
            }`}
          >
            <span className="font-semibold">{service.name}</span>
            <p className="mt-1 text-muted-foreground">{service.description}</p>
          </button>
        ))}
      </div>
      <div className="mt-8">
        <Button disabled={!data.serviceId} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
