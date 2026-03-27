"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/shadcn/tooltip";
import { Toaster } from "@/components/shadcn/sonner";

export function ShadcnProviders({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        {children}
        <Toaster richColors />
      </TooltipProvider>
    </ThemeProvider>
  );
}
