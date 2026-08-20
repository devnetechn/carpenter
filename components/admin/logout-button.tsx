import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/admin/login" });
      }}
    >
      <Button type="submit" variant="ghost">
        Log out
      </Button>
    </form>
  );
}
