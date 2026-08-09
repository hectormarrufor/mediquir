const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID || 'dadica';

const config = {
  dadica: {
    name: 'Mediquir',
    brandColor: 'blue',
    assets: {
      logo: '/tenants/dadica/logo.png',
      favicon: '/tenants/dadica/favicon.jpg',
      fondoGlobal: '/tenants/dadica/fondo.jpg',
      fondoClaro: '/tenants/dadica/fondoclaro.jpg',
      heroImages: {
        flota: '/tenants/dadica/flota.jpg',
        personal: '/tenants/dadica/personal dadica.jpg',
        lowboy: '/tenants/dadica/lowboy.jpg',
        plataforma: '/tenants/dadica/plataforma.jpg',
        retro: '/tenants/dadica/retro.jpg',
        vaccum: '/tenants/dadica/vaccum.jpg',
      },
      carousel: [
        '/tenants/dadica/carrusel1.jpg',
        '/tenants/dadica/carrusel2.jpg',
        '/tenants/dadica/carrusel3.jpg',
        '/tenants/dadica/carrusel4.jpg',
        '/tenants/dadica/carrusel5.jpg',
        '/tenants/dadica/carrusel6.jpg',
        '/tenants/dadica/carrusel7.jpg',
        '/tenants/dadica/carrusel8.jpg',
        '/tenants/dadica/carrusel9.jpg',
        '/tenants/dadica/carrusel10.jpg',
        '/tenants/dadica/carrusel11.jpg',
        '/tenants/dadica/carrusel12.jpg',
        '/tenants/dadica/carrusel20.jpg',
        '/tenants/dadica/carrusel21.jpg'
      ]
    },
    allowedAssetTypes: ['Vehiculo', 'Maquina', 'Remolque']
  },
  forsumaca: {
    name: 'Forsumaca Naval',
    brandColor: 'cyan', 
    assets: {
      logo: '/tenants/forsumaca/logo.png',
      favicon: '/tenants/forsumaca/favicon.jpg',
      fondoGlobal: '/tenants/forsumaca/fondo.jpg',
      fondoClaro: '/tenants/forsumaca/fondoclaro.jpg',
      heroImages: {
        flota: '/tenants/forsumaca/flota.jpg',
        personal: '/tenants/forsumaca/personal.jpg',
        // Puedes agregar las exclusivas de Forzumaca aquí, ej:
        // lanchaRapida: '/tenants/forsumaca/lancha_rapida.jpg'
      },
      carousel: [
        // Las imágenes del carrusel de Forzumaca
        '/tenants/forsumaca/carrusel1.jpg',
        '/tenants/forsumaca/carrusel2.jpg',
        '/tenants/forsumaca/carrusel3.jpg',
      ]
    },
    allowedAssetTypes: ['Lancha', 'Maquina']
  }
};

export const tenant = config[CLIENT_ID];