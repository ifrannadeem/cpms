import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/sidebar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Opera — Property Management",
  description: "2i Investments — Commercial Property Management",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen bg-slate-50 overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
          <Sidebar />
          <main className="flex-1 overflow-y-auto print:overflow-visible">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
