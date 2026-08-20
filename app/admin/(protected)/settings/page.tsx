import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/settings";
import { BusinessInfoForm } from "@/components/admin/business-info-form";
import { BusinessHoursForm } from "@/components/admin/business-hours-form";
import { BlockedTimeList } from "@/components/admin/blocked-time-list";

export default async function SettingsPage() {
  const [settings, hours, blocks] = await Promise.all([
    getBusinessSettings(),
    prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.blockedTime.findMany({ orderBy: { start: "asc" } }),
  ]);

  const settingsForForm = {
    ...settings,
    taxRate: settings.taxRate.toString(),
    depositPercent: settings.depositPercent.toString(),
  };

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-lg font-semibold">Business Information</h1>
        <BusinessInfoForm
          key={settingsForForm.updatedAt.toISOString()}
          settings={settingsForForm}
        />
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Business Hours</h2>
        <BusinessHoursForm
          key={hours.map((h) => `${h.dayOfWeek}:${h.isClosed}:${h.openTime}:${h.closeTime}`).join(",")}
          hours={hours}
        />
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Blocked Time</h2>
        <BlockedTimeList blocks={blocks} />
      </section>
    </div>
  );
}
