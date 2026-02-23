"use client";
// import type { Metadata } from "next";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useState, useEffect } from "react";

// export const metadata: Metadata = {
//   title: "Sign In - Travel & Claim System",
//   description: "Sign in with your Microsoft account to access the Travel & Claim System",
//   robots: {
//     index: false,
//     follow: false,
//   },
// };

export default function LoginPage() {
   const router = useRouter();
   const { data: session } = useSession();
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [error, setError] = useState("");
   const [isLoading, setIsLoading] = useState(false);
  
  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (session) {
      router.push("/");
    }
  }, [session, router]);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      console.log("Attempting login with:", email);
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      console.log("Login result:", result);

      if (result?.error) {
        console.error("Login error:", result.error);
        setError(result.error);
        setIsLoading(false);
      } else if (result?.ok) {
        console.log("Login successful, redirecting...");
        // Successfully logged in, redirect to home
        window.location.href = "/";
      } else {
        setError("Login failed. Please check your credentials.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Login exception:", err);
      setError("An error occurred during sign in");
      setIsLoading(false);
    }
  };

  // const handleGoogleLogin = () => {
  //   signIn("google", {
  //     callbackUrl: "/",
  //   });
  // };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-lg bg-blue-600" />
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
            Travel & Claim System
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to continue
          </p>
        </div>

        <div className="mt-8 rounded-lg bg-white px-6 py-8 shadow-md">
          {/* Email/Password Login Form */}
          <form onSubmit={handleCredentialsLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your.email@example.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in..." : "Sign in with Email"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Microsoft Sign-in */}
          <form action="/api/auth/signin/azure-ad" method="POST">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 21 21"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="1"
                  y="1"
                  width="9"
                  height="9"
                  fill="#F25022"
                />
                <rect
                  x="1"
                  y="11"
                  width="9"
                  height="9"
                  fill="#00A4EF"
                />
                <rect
                  x="11"
                  y="1"
                  width="9"
                  height="9"
                  fill="#7FBA00"
                />
                <rect
                  x="11"
                  y="11"
                  width="9"
                  height="9"
                  fill="#FFB900"
                />
              </svg>
              Sign in with Microsoft
            </button>
          </form>
                {/* <button
                    type="button"
                    onClick={handleGoogleLogin}
                   className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 "
                  >
                    <img
                      src="/assets/google-lime.png"
                      alt="google-icon"
                      className="h-5 w-5"
                    />
                    <span>Log in with Google</span>
                  </button> */}

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              By signing in, you agree to our{" "}
              <a href="#" className="text-blue-600 hover:text-blue-700">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="text-blue-600 hover:text-blue-700">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-blue-900">
            Need Help?
          </h3>
          <p className="text-xs text-blue-800">
            If you&apos;re having trouble signing in, please contact your IT administrator 
            or email support@example.com for assistance.
          </p>
        </div>

        <div className="text-center text-sm text-gray-600">
          <p>
            Don&apos;t have access?{" "}
            <a href="#" className="font-medium text-blue-600 hover:text-blue-700">
              Request Access
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}