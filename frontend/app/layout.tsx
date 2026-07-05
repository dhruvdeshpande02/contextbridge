"use client";
import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WalkthroughProvider } from "@/components/walkthrough/walkthrough-context";
import { WalkthroughOverlay } from "@/components/walkthrough/walkthrough-overlay";
import { WelcomeGate } from "@/components/walkthrough/welcome-gate";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
  }));
  return (
    <html lang="en">
      <head>
        <title>ContextBridge — Meeting Intelligence</title>
        <meta name="description" content="AI-powered meeting intelligence. Extract decisions, action items, and gaps from your transcripts." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <WalkthroughProvider>
            {children}
            <WalkthroughOverlay />
            <WelcomeGate />
          </WalkthroughProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
