import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, Londrina_Solid } from "next/font/google";
import "./globals.css";
import { ConfirmProvider } from "@/app/components/confirm-modal";
import { AppToaster } from "@/app/components/toaster";

// The type split is semantic, not decorative: Bricolage Grotesque carries UI
// and German, DM Mono marks English glosses, labels and metadata -- "this is
// scaffolding or translation" -- and Londrina Solid is the display voice for
// the wordmark, headings and primary buttons.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  // Optical size: the design loads the opsz axis so large text tightens up and
  // small text opens up automatically.
  axes: ["opsz"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// 400 is the everyday display weight (wordmark, buttons, labels); 900 is for
// h1/h2, which the design leaves at the browser's default bold.
const londrina = Londrina_Solid({
  variable: "--font-londrina",
  subsets: ["latin"],
  weight: ["400", "900"],
});

export const metadata: Metadata = {
  title: "Starvogel",
  description: "Practice German conversation with an AI tutor that explains your mistakes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${dmMono.variable} ${londrina.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ConfirmProvider>{children}</ConfirmProvider>
        <AppToaster />
      </body>
    </html>
  );
}
