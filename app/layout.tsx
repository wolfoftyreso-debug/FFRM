import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Relationship Agent",
    template: "%s · Relationship Agent",
  },
  description:
    "Private personal relationship agent: memory, calendar, SMS and AI triage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
