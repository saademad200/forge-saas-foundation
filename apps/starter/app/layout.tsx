import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge — a production-grade AI SaaS foundation",
  description:
    "A reusable, AI-native full-stack foundation for building multi-tenant AI SaaS apps fast — with provable tenant isolation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
