import { SITIO } from '@/app/lib/seo';

// Lo público se indexa; el panel del personal, el portal de clientes y las API no
export default function robots() {
    return {
        rules: [{ userAgent: '*', allow: '/', disallow: ['/superuser', '/b2b', '/api', '/login', '/forbidden'] }],
        sitemap: `${SITIO.url}/sitemap.xml`,
        host: SITIO.url,
    };
}
