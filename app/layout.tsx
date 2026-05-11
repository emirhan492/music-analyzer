import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local"; // YENİ EKLENDİ
import "./globals.css";
import Providers from "@/components/Providers";

// 1. Orijinal Geist Fontları
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 2. YENİ EKLENEN: Aquire Lokal Fontu
const aquire = localFont({
  src: "./fonts/Aquire.otf", // EĞER indirdiğin dosya .ttf ise burayı .ttf yapmayı unutma
  variable: "--font-aquire",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Music Analyzer", 
  description: "Spotify Playlist Analyzer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${aquire.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}