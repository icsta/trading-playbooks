import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trading Cockpit",
  description: "Local research console for trading-playbooks",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
