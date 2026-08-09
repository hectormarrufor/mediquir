import { tenant } from '@/config/tenant';
import ClientLayout from './ClientLayout';

// 1. Exportamos el viewport correctamente para Next.js 15
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata = {
  title: tenant.name,
  icons: {
    icon: tenant.assets.favicon,
    type: 'image/jpeg'
  },
  // ELIMINADA la línea: manifest: '/manifest.js', 
  // Next.js lo inyecta automáticamente desde app/manifest.js
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      {/* ELIMINADA la etiqueta meta viewport manual de aquí */}
      <body suppressHydrationWarning>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}