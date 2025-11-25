import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// 1. IMPORTAMOS EL TOASTER
import { Toaster } from "sonner"; 

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PartyJam App",
  description: "La democracia musical",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {children}
        
        {/* 2. LO COLOCAMOS AQUÍ, justo antes de cerrar el body. 
            richColors = Colores bonitos (Verde éxito, Rojo error)
            position = Donde sale (arriba al centro es lo mejor para móvil)
        */}
        <Toaster position="top-center" richColors theme="dark" />
      </body>
    </html>
  );
}
