import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Saffron & Sage · Good food, good company",
  description:
    "Your neighbourhood Indian kitchen. Order a favourite, reserve a table, and make yourself at home.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
