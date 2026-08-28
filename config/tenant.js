const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID || 'mediquir';

const config = {
  mediquir: {
    name: 'Mediquir',
    brandColor: 'blue',
    assets: {
      logo: '/tenants/mediquir/logo.png',
      favicon: '/tenants/mediquir/favicon.png',
      fondoGlobal: '/tenants/mediquir/fondo.jpg',
      fondoClaro: '/tenants/mediquir/fondoclaro.jpg',
      heroImages: {
        flota: '/tenants/mediquir/flota.jpg',
        personal: '/tenants/mediquir/personal mediquir.jpg',
        lowboy: '/tenants/mediquir/lowboy.jpg',
        plataforma: '/tenants/mediquir/plataforma.jpg',
        retro: '/tenants/mediquir/retro.jpg',
        vaccum: '/tenants/mediquir/vaccum.jpg',
      },
    
    },
    allowedAssetTypes: ['Vehiculo', 'Maquina', 'Remolque']
  }
};

export const tenant = config[CLIENT_ID];