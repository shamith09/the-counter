"use client";

import { SessionProvider } from "next-auth/react";
import { MarqueeAdsProvider } from "./marquee-ads";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MarqueeAdsProvider>{children}</MarqueeAdsProvider>
    </SessionProvider>
  );
}
