import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextAuthProvider } from "@/components/auth/AuthProvider";
import AuthRoleVerifier from "@/components/auth/AuthRoleVerifier";
import CommandPalette from '@/components/CommandPalette';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const envTitle = process.env.NEXT_PUBLIC_SIGNIN_TITLE;
const envSubtitle = process.env.NEXT_PUBLIC_SIGNIN_SUBTITLE;
const favImage = process.env.NEXT_PUBLIC_SIGNIN_FAVICON;
export const metadata: Metadata = {
  title: envTitle && envSubtitle ? `${envTitle} - ${envSubtitle}` : envTitle ?? "eloop - Event Management System",
  description: envSubtitle ?? "A serverless event management system with QR code integration",
  icons: {
    icon: favImage ?? "/favicon.svg",
    shortcut: favImage ?? "/favicon.svg",
    apple: favImage ?? "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextAuthProvider>
          {children}
          <AuthRoleVerifier />
          <CommandPalette />
        </NextAuthProvider>
      </body>
    </html>
  );
}
