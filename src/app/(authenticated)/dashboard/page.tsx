import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MainDashboard } from "@/components/features/dashboard/MainDashboard";
import { userHasPermission } from "@/lib/auth/role-check";
import { auth } from "@/server/auth";

export const metadata: Metadata = {
  title: "Dashboard - Travel & Claim System",
  description: "Dashboard for travel, claim, finance, and accounting",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!userHasPermission(session.user, "dashboard", "read")) {
    redirect("/");
  }

  return <MainDashboard />;
}
