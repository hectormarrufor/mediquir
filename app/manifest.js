export default function manifest() {
  const clientId = process.env.NEXT_PUBLIC_CLIENT_ID || 'dadica';
  const isDadica = clientId === 'dadica';

  return {
    name: isDadica ? 'Dadica App' : 'Forsumaca App',
    short_name: isDadica ? 'Dadica' : 'Forsumaca',
    description: isDadica ? 'App para gestión de transporte industrial Dadica' : 'App para gestión logística Forsumaca',
    start_url: '/',
    display: 'standalone',
    background_color: '#808080',
    theme_color: '#0a0a0a',
    orientation: 'portrait',
    scope: '/',
    lang: 'es-VE',
    dir: 'ltr',
    icons: [
      {
        src: `/tenants/${clientId}/icons/icon-192x192.png`,
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: `/tenants/${clientId}/icons/icon-512x512.png`,
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  };
}