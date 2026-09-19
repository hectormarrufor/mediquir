import Link from 'next/link';
import { Categoria, Producto } from '@/models';
import { SITIO, rutaCategoria } from '@/app/lib/seo';
import estilos from '@/app/components/seo/seo.module.css';

// Texto de la portada pensado para buscadores y para las personas: quiénes somos, dónde estamos, a dónde enviamos y las categorías.
// Se arma en el servidor, así Google lo lee completo sin ejecutar JavaScript.
export default async function SeccionSeo() {
    let categorias = [];
    try {
        const filas = await Categoria.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']] });
        categorias = await Promise.all(filas.map(async (c) => ({ id: c.id, nombre: c.nombre, total: await Producto.count({ where: { categoriaId: c.id } }) })));
    } catch (e) {
        console.error('SeccionSeo:', e.message);
    }
    return (
        <section aria-labelledby="quienes-somos" style={{ background: '#fff', padding: '28px 12px' }}>
            <div className={estilos.texto} style={{ maxWidth: 1100, margin: '0 auto', color: '#16233f' }}>
                <h2 id="quienes-somos" className={estilos.h2} style={{ marginTop: 0 }}>Materiales y equipos médico-quirúrgicos en Ciudad Ojeda, Zulia</h2>
                <p>
                    {SITIO.nombre} es una distribuidora de insumos médicos y equipos quirúrgicos en {SITIO.ciudad}, estado {SITIO.estado}. Vendemos al mayor y al detal a clínicas, hospitales,
                    farmacias, consultorios y particulares: jeringas, agujas, guantes, mascarillas, catéteres, gasas, drenajes, circuitos de anestesia y mucho más.
                </p>
                <p>
                    <strong>Enviamos a toda Venezuela.</strong> Compra en nuestra tienda en línea, escríbenos por WhatsApp o visítanos en {SITIO.direccion}.{' '}
                    <Link href="/envios-nacionales">Conoce cómo son los envíos nacionales</Link>.
                </p>
                {categorias.length > 0 && (
                    <>
                        <h3 className={estilos.h2}>Explora por categoría</h3>
                        <ul className={estilos.lista}>
                            {categorias.map((c) => <li key={c.id}><Link href={rutaCategoria(c)}>{c.nombre}</Link> ({c.total} productos)</li>)}
                        </ul>
                    </>
                )}
            </div>
        </section>
    );
}
