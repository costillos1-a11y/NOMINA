import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neumovida | Nómina",
  description: "Control interno de nómina por sede"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
