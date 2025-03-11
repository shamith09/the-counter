import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "@/components/providers";
import { GridBackground } from "@/components/grid-background";
import { JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://thecounter.live/"),
  title: "The Counter",
  description:
    "A global counter that can be incremented by anyone, anywhere, anytime.",
  openGraph: {
    title: "The Counter",
    description:
      "A global counter that can be incremented by anyone, anywhere, anytime.",
    url: "https://thecounter.live/",
    siteName: "The Counter",
    images: [
      {
        url: "/og-image.jpeg",
        width: 3024,
        height: 1890,
        alt: "The Counter",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Counter",
    description:
      "A global counter that can be incremented by anyone, anywhere, anytime.",
    images: ["/og-image.jpeg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.className} bg-black`}>
        <GridBackground />
        <Providers>
          <div className="z-20 relative">{children}</div>
          <Toaster theme="dark" position="top-right" />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
