import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Sampark | NCC DTE UP — Development preview",
    template: "%s | Sampark",
  },
  description:
    "A development platform for participation, connection and secure administration. Synthetic content only.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
