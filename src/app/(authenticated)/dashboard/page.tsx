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

function getFallbackRoute(user: Parameters<typeof userHasPermission>[0]) {
  if (userHasPermission(user, "travel", "read")) return "/travel";
  if (userHasPermission(user, "claims", "read")) return "/claims";
  if (userHasPermission(user, "approvals", "read")) return "/approvals";
  if (userHasPermission(user, "bailout", "read")) return "/bailout";
  if (userHasPermission(user, "accounting", "read")) return "/accounting";
  if (userHasPermission(user, "journals", "read")) return "/journal";
  if (userHasPermission(user, "profile", "read")) return "/profile";
  return "/login";
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!userHasPermission(session.user, "dashboard", "read")) {
    redirect(getFallbackRoute(session.user));
  }

  return <MainDashboard />;
}
