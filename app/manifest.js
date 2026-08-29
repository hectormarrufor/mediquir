export default function manifest() {
  const clientId = process.env.NEXT_PUBLIC_CLIENT_ID || 'mediquir';
  const isMediquir = clientId === 'mediquir';

  return {
    name: isMediquir ? 'Mediquir App' : 'Generic App',
    short_name: isMediquir ? 'Mediquir' : 'Generic',
    description: isMediquir ? 'App para venta de insumos medicos Mediquir' : 'App para gestión logística Genérica',
    start_url: '/',
    display: 'standalone',
    theme_color: "#1e4152",
    background_color: "#22303a",
    orientation: 'portrait',
    scope: '/',
    lang: 'es-VE',
    dir: 'ltr',
    icons: [
      {
        src: `/tenants/${clientId}/icons/icon-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: `/tenants/${clientId}/icons/icon-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: `/tenants/${clientId}/icons/android-launchericon-96-96.png`,
        sizes: '96x96',
        type: 'image/png',
        purpose: 'monochrome'
      }

    ]
  };
}