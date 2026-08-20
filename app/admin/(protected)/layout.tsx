import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/admin/logout-button";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <aside className="border-r bg-muted/20">
        <AdminNav />
      </aside>
      <div className="flex flex-col">
        <header className="flex items-center justify-end border-b px-6 py-3">
          <LogoutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
