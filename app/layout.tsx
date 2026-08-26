import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Personal Phone",
    template: "%s · Personal Phone",
  },
  description:
    "AI-native personal phone: SMS, MMS, calls and relationship-aware AI.",
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
