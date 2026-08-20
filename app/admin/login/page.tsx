import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

async function login(formData: FormData) {
  "use server";
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "unknown";
  const { allowed } = checkRateLimit(`login:${ip}`);
  if (!allowed) {
    redirect("/admin/login?error=rate-limited");
  }

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/admin",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/admin/login?error=1");
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-6 text-xl font-semibold">Admin Sign In</h1>
        <form action={login} className="space-y-4">
          {error === "rate-limited" && (
            <p className="text-sm text-red-600">
              Too many attempts. Please try again in a few minutes.
            </p>
          )}
          {error === "1" && (
            <p className="text-sm text-red-600">Invalid email or password.</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </form>
      </Card>
    </div>
  );
}
