import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lastro",
  description: "Painel financeiro pessoal para PJ com contratos internacionais."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
