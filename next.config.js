// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  clientsClaim: true,
  disable: process.env.NODE_ENV === 'development',
  buildExcludes: [/app-build-manifest\.json$/],
  swSrc: 'sw.js'
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite levantar un segundo `next dev` (p. ej. para pruebas automáticas) con otra carpeta de build
  // y así no pisar la de tu servidor: NEXT_DIST_DIR=.next-test npx next dev -p 3010
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Importa solo los iconos/componentes que se usan en vez de cargar cada librería completa (menos módulos por compilar)
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks', '@mantine/dates', '@mantine/charts', '@tabler/icons-react', 'date-fns', 'dayjs'],
    // `npm run dev` usa Turbopack, que ignora la función `webpack` de abajo (esa solo aplica a `next build` y a `dev:webpack`).
    // Declarar esta sección con su valor por defecto le dice a Next que Turbopack está contemplado y quita el aviso
    // "Webpack is configured while Turbopack is not". No cambia nada de cómo compila.
    turbo: {
      resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    },
  },
  serverExternalPackages: ['sequelize', 'pg', 'pg-hstore', 'pg-connection-string'],
  
  // NUEVO: Configuración de dominios externos permitidos para next/image
  images: {
    dangerouslyAllowSVG: true, // Necesario para placehold.co
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com', // Autoriza tus imágenes subidas al Vercel Blob
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },

  // Lo privado (panel del personal, portal de clientes, API, login) no debe aparecer en Google
  async headers() {
    const privado = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    return [
      { source: '/superuser/:path*', headers: privado },
      { source: '/b2b/:path*', headers: privado },
      { source: '/login', headers: privado },
      { source: '/api/:path*', headers: privado },
    ];
  },

  webpack: (config) => {
    // Apaga de raíz las auditorías de Webpack sobre límites de tamaño de archivos
    config.performance = {
      ...config.performance,
      hints: false, 
    };

    // Filtra warnings específicos de la consola de compilación para mantenerla limpia
    config.ignoreWarnings = [
      { module: /node_modules\/@tiptap/ },
      { message: /cadenas muy largas/i },
      { message: /size limit/i },
      { message: /maximum file size/i }
    ];

    return config;
  },
};

module.exports = withPWA(nextConfig);