/**
 * noindex layout — this route must never appear in search results
 * (2026-09-02 sweep, PENDING 10.A.11). The page itself is a client component
 * ("use client") and cannot export metadata, so the robots directive lives in
 * this server layout.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return children;
}
