import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined;
  const title = "VINE Pulse | Client Reporting & Operations";
  const description =
    "A secure daily reporting portal for recruiting, onboarding, training, scheduling, and time-and-attendance operations.";

  return {
    metadataBase,
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: "/og-v2.png",
          width: 1200,
          height: 630,
          alt: "VINE Pulse client reporting and operations portal",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-v2.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
