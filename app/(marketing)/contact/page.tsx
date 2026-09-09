import { getBusinessSettings } from "@/lib/settings";
import { ContactForm } from "@/components/marketing/contact-form";

export default async function ContactPage() {
  const settings = await getBusinessSettings();

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 md:grid-cols-2">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Contact Us</h1>
        <p className="mt-3 text-muted-foreground">
          Have a question before requesting a full quote? Send us a message and
          we&apos;ll get back to you.
        </p>
        <div className="mt-8 space-y-2 text-sm text-muted-foreground">
          <p>{settings.phone}</p>
          <p>{settings.email}</p>
          <p>
            Serving {settings.addressCity} County, {settings.addressState} and the
            surrounding area
          </p>
        </div>
      </div>
      <ContactForm />
    </div>
  );
}
