import { tenant } from '@/config/tenant';
import ClientLayout from './ClientLayout';
import Script from 'next/script';
import { DESCRIPCION_HOME, SITIO, TITULO_HOME } from '@/app/lib/seo';

// 1. Exportamos el viewport correctamente para Next.js 15
export const viewport = {
  width: 'device-width',
  initialScale: 1, // sin límite de zoom: es mejor para la accesibilidad y Google lo valora
};

export const metadata = {
  metadataBase: new URL(SITIO.url),
  title: { default: TITULO_HOME, template: `%s | ${tenant.name}` },
  description: DESCRIPCION_HOME,
  applicationName: tenant.name,
  keywords: ['insumos médicos', 'materiales médicos', 'equipos quirúrgicos', 'material médico quirúrgico', 'jeringas', 'guantes', 'mascarillas', 'catéteres', 'distribuidora médica', 'Ciudad Ojeda', 'Zulia', 'Venezuela', 'envíos a toda Venezuela'],
  authors: [{ name: SITIO.razonSocial }],
  creator: SITIO.razonSocial,
  formatDetection: { telephone: true, address: true, email: true },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined },
  openGraph: { type: 'website', locale: 'es_VE', siteName: tenant.name },
  icons: {
    icon: tenant.assets.favicon,
    type: 'image/jpeg'
  },
  // ELIMINADA la línea: manifest: '/manifest.js', 
  // Next.js lo inyecta automáticamente desde app/manifest.js
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-VE">
      {/* ELIMINADA la etiqueta meta viewport manual de aquí */}
      <body suppressHydrationWarning>
        <ClientLayout>
          {children}
        </ClientLayout>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}