import Link from 'next/link';
import { SITIO, absoluta } from '@/app/lib/seo';
import estilos from '@/app/components/seo/seo.module.css';

export const metadata = {
    title: 'Envíos a toda Venezuela de materiales médico-quirúrgicos',
    description: 'Mediquir despacha insumos médicos y equipos quirúrgicos desde Ciudad Ojeda (Zulia) a todo el país: Maracaibo, Caracas, Valencia, Barquisimeto y más. Compra por WhatsApp o en la tienda en línea.',
    alternates: { canonical: '/envios-nacionales' },
};

// Página informativa: responde "¿hacen envíos a mi ciudad?" y refuerza el posicionamiento nacional
export default function EnviosNacionales() {
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage', name: 'Envíos nacionales', url: absoluta('/envios-nacionales'),
        about: { '@type': 'Organization', name: SITIO.nombre, areaServed: { '@type': 'Country', name: 'Venezuela' } },
    };
    return (
        <main className={estilos.pagina}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <nav className={estilos.migas} aria-label="Ruta"><Link href="/">Inicio</Link> › Envíos nacionales</nav>
            <section className={`${estilos.panel} ${estilos.texto}`}>
                <h1 className={estilos.titulo}>Envíos a toda Venezuela</h1>
                <p>
                    {SITIO.nombre} es una distribuidora de materiales y equipos médico-quirúrgicos ubicada en {SITIO.ciudad}, estado {SITIO.estado}.
                    Despachamos a todo el país: Maracaibo, Cabimas, Caracas, Valencia, Maracay, Barquisimeto, Mérida, San Cristóbal, Puerto Ordaz, Barcelona y cualquier otra ciudad.
                </p>
                <h2 className={estilos.h2}>Cómo comprar</h2>
                <ul className={estilos.lista}>
                    <li>Elige tus productos en la <Link href="/#productos-section">tienda en línea</Link> y paga por Pago Móvil.</li>
                    <li>Si compras al mayor (clínicas, farmacias, distribuidores), escríbenos por <a href={`https://wa.me/${SITIO.whatsapp}`} rel="noopener noreferrer">WhatsApp</a> y te atendemos con precios al mayor y crédito para clientes aprobados.</li>
                    <li>Coordinamos el envío con la empresa de transporte que prefieras y te avisamos cuando tu pedido esté listo.</li>
                </ul>
                <h2 className={estilos.h2}>Horario de despacho</h2>
                <p>Despachamos de lunes a viernes hasta las 4:30 p. m. y los sábados hasta las 12:30 p. m. (hora de Venezuela). Los pedidos hechos fuera de ese horario salen el siguiente día hábil.</p>
                <h2 className={estilos.h2}>¿Dónde estamos?</h2>
                <p>{SITIO.direccion}. Teléfono y WhatsApp: {SITIO.telefono.replace('+58-', '0')} · {SITIO.email}</p>
            </section>
        </main>
    );
}
