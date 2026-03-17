import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppShell } from "@/components/layouts/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect("/login");
  }

  return <AppShell session={session}>{children}</AppShell>;
}