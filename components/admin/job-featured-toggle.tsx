import { Button } from "@/components/ui/button";
import { toggleFeaturedOnWebsite } from "@/app/admin/(protected)/jobs/[id]/actions";

export function JobFeaturedToggle({ jobId, featured }: { jobId: string; featured: boolean }) {
  async function toggle() {
    "use server";
    await toggleFeaturedOnWebsite(jobId, !featured);
  }

  return (
    <form action={toggle}>
      <Button type="submit" size="sm" variant="outline">
        {featured ? "Remove from website" : "Feature on website"}
      </Button>
    </form>
  );
}
