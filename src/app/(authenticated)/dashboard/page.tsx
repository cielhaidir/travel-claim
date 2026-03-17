import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { TenantDashboard } from "@/components/features/dashboard/TenantDashboard";
import { auth } from "@/server/auth";

export const metadata: Metadata = {
  title: "Dashboard - Travel & Claim System",
  description: "Tenant-aware dashboard for travel, claim, finance, and accounting",
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

  return <TenantDashboard />;
}
