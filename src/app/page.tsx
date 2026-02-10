import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export const metadata: Metadata = {
  title: "Travel & Claim System - Streamline Your Travel and Expense Management",
  description: "Efficient Trip request and claim management system with automated approvals, integrated with Microsoft authentication.",
  openGraph: {
    title: "Travel & Claim System",
    description: "Streamline your travel and expense management",
    type: "website",
  },
};

export default async function LandingPage() {
  const session = await auth();
  
  // Redirect authenticated users to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600" />
            <span className="text-xl font-semibold">Travel & Claim</span>
          </div>
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl lg:text-6xl">
              Streamline Your Business Trip and Expense Management
            </h1>
            <p className="mb-8 text-lg text-gray-600 md:text-xl">
              Manage trip requests, submit claims, and track approvals all in one place. 
              Secure, efficient, and integrated with your Microsoft account.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-lg bg-blue-600 px-8 py-4 text-lg font-semibold text-white hover:bg-blue-700"
            >
              Get Started
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section className="border-t bg-gray-50 py-16">
          <div className="container mx-auto px-4">
            <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
              Key Features
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              <FeatureCard
                title="Bistrip Requests"
                description="Create and manage trip requests with multi-level approvals and real-time status tracking."
                icon="✈️"
              />
              <FeatureCard
                title="Expense Claims"
                description="Submit entertainment and non-entertainment claims with AI-powered receipt processing."
                icon="💰"
              />
              <FeatureCard
                title="Smart Approvals"
                description="Automated approval routing based on amount thresholds and organizational hierarchy."
                icon="✅"
              />
              <FeatureCard
                title="Real-time Notifications"
                description="Stay updated with instant notifications for approvals, status changes, and actions required."
                icon="🔔"
              />
              <FeatureCard
                title="Secure Authentication"
                description="Enterprise-grade security with Microsoft Entra ID integration and role-based access control."
                icon="🔒"
              />
              <FeatureCard
                title="Mobile Ready"
                description="Progressive web app with offline support for submitting claims on the go."
                icon="📱"
              />
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="border-t py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="mb-6 text-3xl font-bold text-gray-900">
                Enterprise Security & Compliance
              </h2>
              <p className="mb-8 text-lg text-gray-600">
                Built with security and compliance at its core. All data is encrypted, 
                audit trails are comprehensive, and access is strictly controlled through 
                role-based permissions integrated with your Microsoft tenant.
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-600">
                <span className="rounded-full border border-gray-300 px-4 py-2">
                  Microsoft Entra ID
                </span>
                <span className="rounded-full border border-gray-300 px-4 py-2">
                  Role-based Access
                </span>
                <span className="rounded-full border border-gray-300 px-4 py-2">
                  Audit Logging
                </span>
                <span className="rounded-full border border-gray-300 px-4 py-2">
                  Data Encryption
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-gray-600 md:flex-row">
            <div>© 2026 Travel & Claim System. All rights reserved.</div>
            <div className="flex gap-6">
              <Link href="#" className="hover:text-gray-900">
                Privacy Policy
              </Link>
              <Link href="#" className="hover:text-gray-900">
                Terms of Service
              </Link>
              <Link href="#" className="hover:text-gray-900">
                Support
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-4 text-4xl">{icon}</div>
      <h3 className="mb-2 text-xl font-semibold text-gray-900">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}