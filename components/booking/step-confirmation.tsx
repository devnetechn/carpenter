import type { ServiceOption, WizardData } from "@/components/booking/types";

export function StepConfirmation({
  service,
  data,
  bookingRef,
}: {
  service: ServiceOption | undefined;
  data: WizardData;
  bookingRef: string;
}) {
  return (
    <div className="text-center">
      <h1 className="font-serif text-2xl font-semibold">Thanks, {data.customerName}!</h1>
      <p className="mt-3 text-muted-foreground">
        We&apos;ve received your request and will be in touch to confirm your consultation.
      </p>
      <div className="mt-8 space-y-2 rounded-lg border p-6 text-left text-sm">
        <p>
          <span className="font-semibold">Booking reference:</span> {bookingRef}
        </p>
        <p>
          <span className="font-semibold">Project type:</span> {service?.name}
        </p>
        <p>
          <span className="font-semibold">Address:</span> {data.addressStreet}, {data.addressCity},{" "}
          {data.addressState} {data.addressZip}
        </p>
        {data.slotStart && (
          <p>
            <span className="font-semibold">Consultation:</span>{" "}
            {new Date(data.slotStart).toLocaleString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
