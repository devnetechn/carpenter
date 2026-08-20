"use client";

import { useState } from "react";
import { StepIndicator } from "@/components/booking/step-indicator";
import { StepSelectService } from "@/components/booking/step-select-service";
import { StepProjectDetails } from "@/components/booking/step-project-details";
import { StepPhotos } from "@/components/booking/step-photos";
import type { ServiceOption, WizardData } from "@/components/booking/types";
import { INITIAL_WIZARD_DATA } from "@/components/booking/types";

export function BookingWizard({ services }: { services: ServiceOption[] }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_WIZARD_DATA);

  function updateData(patch: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, 8));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <StepIndicator currentStep={step} />
      {step === 1 && (
        <StepSelectService
          services={services}
          data={data}
          updateData={updateData}
          goNext={goNext}
        />
      )}
      {step === 2 && (
        <StepProjectDetails
          service={services.find((s) => s.id === data.serviceId)!}
          data={data}
          updateData={updateData}
          goNext={goNext}
          goBack={goBack}
        />
      )}
      {step === 3 && (
        <StepPhotos data={data} updateData={updateData} goNext={goNext} goBack={goBack} />
      )}
    </div>
  );
}
