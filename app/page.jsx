import HomeCliente from './HomeCliente';
import SeccionSeo from './components/landing/SeccionSeo';
import { DESCRIPCION_HOME, SITIO, TITULO_HOME, absoluta } from '@/app/lib/seo';

export const revalidate = 3600;

export const metadata = {
    title: { absolute: TITULO_HOME },
    description: DESCRIPCION_HOME,
    alternates: { canonical: '/' },
    openGraph: { title: TITULO_HOME, description: DESCRIPCION_HOME, url: SITIO.url, type: 'website', locale: 'es_VE', siteName: SITIO.nombre, images: [{ url: absoluta(SITIO.imagenSocial) }] },
    twitter: { card: 'summary_large_image', title: TITULO_HOME, description: DESCRIPCION_HOME, images: [absoluta(SITIO.imagenSocial)] },
};

// Datos estructurados: le dicen a Google quién es Mediquir, dónde está y a dónde vende
const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': ['Store', 'MedicalBusiness'],
            '@id': `${SITIO.url}/#negocio`,
            name: SITIO.nombre,
            legalName: SITIO.razonSocial,
            url: SITIO.url,
            logo: absoluta(SITIO.logo),
            image: absoluta(SITIO.imagenSocial),
            description: DESCRIPCION_HOME,
            telephone: SITIO.telefono,
            email: SITIO.email,
            address: { '@type': 'PostalAddress', streetAddress: SITIO.direccion, addressLocality: SITIO.ciudad, addressRegion: SITIO.estado, addressCountry: 'VE' },
            areaServed: [{ '@type': 'Country', name: 'Venezuela' }, { '@type': 'City', name: SITIO.ciudad }],
            sameAs: [SITIO.instagram],
            priceRange: '$',
            currenciesAccepted: 'USD, VES',
            paymentAccepted: 'Pago Móvil, Efectivo, Zelle',
        },
        {
            '@type': 'WebSite',
            '@id': `${SITIO.url}/#sitio`,
            url: SITIO.url,
            name: SITIO.nombre,
            inLanguage: 'es-VE',
            publisher: { '@id': `${SITIO.url}/#negocio` },
            potentialAction: { '@type': 'SearchAction', target: `${SITIO.url}/?buscar={termino}`, 'query-input': 'required name=termino' },
        },
    ],
};

// Portada de la tienda. El texto para buscadores se arma en el servidor y se coloca dentro de la parte interactiva.
export default function HomePage() {
    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <HomeCliente seo={<SeccionSeo />} />
        </>
    );
}
