import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sequelize } from '@/models';
import { puedeEditarInventario, requerirStaff } from '../_lib';

export const dynamic = 'force-dynamic';

const TABLAS = { producto: 'Productos', grupo: 'GruposEquivalencia', marca: 'Marcas' };
const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const NOMBRE_VALIDO = /^[A-Za-z0-9_.\-]{3,120}\.(jpg|jpeg|png|webp)$/i;

const consulta = (sql, replacements) => sequelize.query(sql, { replacements });

// Cola de revisión de fotos.
//  · modo=revisar : imágenes cargadas automáticamente y aún sin revisar (las de menor coincidencia primero)
//  · modo=faltan  : entidades SIN foto que necesitan una propia: grupos de equivalencia, productos sueltos (sin grupo) y marcas.
//                   Un producto que pertenece a un grupo usa la foto del grupo y no se pregunta.
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { searchParams } = new URL(request.url);
        const modo = searchParams.get('modo') === 'faltan' ? 'faltan' : 'revisar';
        const excluir = (searchParams.get('excluir') || '').split(',').filter((x) => /^(producto|grupo|marca):\d+$/.test(x));
        const limite = Math.min(Number(searchParams.get('limite')) || 25, 60);

        const [[conteo]] = await consulta(`SELECT
            (SELECT count(*) FROM "ImagenAuditoria" a JOIN "Productos" p ON a.tipo = 'producto' AND p.id = a."refId" WHERE a.estado = 'PENDIENTE' AND p.imagen IS NOT NULL)
          + (SELECT count(*) FROM "ImagenAuditoria" a JOIN "GruposEquivalencia" g ON a.tipo = 'grupo' AND g.id = a."refId" WHERE a.estado = 'PENDIENTE' AND g.imagen IS NOT NULL)
          + (SELECT count(*) FROM "ImagenAuditoria" a JOIN "Marcas" m ON a.tipo = 'marca' AND m.id = a."refId" WHERE a.estado = 'PENDIENTE' AND m.imagen IS NOT NULL) AS por_revisar,
            (SELECT count(*) FROM "ImagenAuditoria" WHERE estado = 'APROBADA') AS aprobadas,
            (SELECT count(*) FROM "GruposEquivalencia" WHERE imagen IS NULL) AS faltan_grupos,
            (SELECT count(*) FROM "Productos" WHERE "grupoEquivalenciaId" IS NULL AND imagen IS NULL) AS faltan_productos,
            (SELECT count(*) FROM "Marcas" WHERE imagen IS NULL) AS faltan_marcas`);

        const excl = (tipo) => excluir.filter((e) => e.startsWith(`${tipo}:`)).map((e) => Number(e.split(':')[1]));
        const noIn = (tipo) => (excl(tipo).length ? `AND x.id NOT IN (${excl(tipo).join(',')})` : '');

        let items;
        if (modo === 'revisar') {
            [items] = await consulta(`
                SELECT * FROM (
                    SELECT 'producto' tipo, x.id, x.codigo, x.nombre, m.nombre marca, c.nombre categoria, x.imagen, a.fuente, a.pagina, a.puntaje
                      FROM "Productos" x JOIN "ImagenAuditoria" a ON a.tipo = 'producto' AND a."refId" = x.id AND a.estado = 'PENDIENTE'
                      LEFT JOIN "Marcas" m ON m.id = x."marcaId" LEFT JOIN "Categorias" c ON c.id = x."categoriaId" WHERE x.imagen IS NOT NULL ${noIn('producto')}
                    UNION ALL
                    SELECT 'grupo', x.id, NULL, x.nombre, NULL, c.nombre, x.imagen, a.fuente, a.pagina, a.puntaje
                      FROM "GruposEquivalencia" x JOIN "ImagenAuditoria" a ON a.tipo = 'grupo' AND a."refId" = x.id AND a.estado = 'PENDIENTE'
                      LEFT JOIN "Categorias" c ON c.id = x."categoriaId" WHERE x.imagen IS NOT NULL ${noIn('grupo')}
                    UNION ALL
                    SELECT 'marca', x.id, NULL, x.nombre, NULL, NULL, x.imagen, a.fuente, a.pagina, a.puntaje
                      FROM "Marcas" x JOIN "ImagenAuditoria" a ON a.tipo = 'marca' AND a."refId" = x.id AND a.estado = 'PENDIENTE' WHERE x.imagen IS NOT NULL ${noIn('marca')}
                ) t ORDER BY puntaje ASC NULLS FIRST, tipo, id LIMIT ${limite}`);
        } else {
            [items] = await consulta(`
                SELECT * FROM (
                    SELECT 1 orden, 'grupo' tipo, x.id, NULL codigo, x.nombre, NULL marca, c.nombre categoria, NULL imagen, NULL fuente, NULL pagina, NULL puntaje
                      FROM "GruposEquivalencia" x LEFT JOIN "Categorias" c ON c.id = x."categoriaId" WHERE x.imagen IS NULL ${noIn('grupo')}
                    UNION ALL
                    SELECT 2, 'producto', x.id, x.codigo, x.nombre, m.nombre, c.nombre, NULL, NULL, NULL, NULL
                      FROM "Productos" x LEFT JOIN "Marcas" m ON m.id = x."marcaId" LEFT JOIN "Categorias" c ON c.id = x."categoriaId"
                     WHERE x."grupoEquivalenciaId" IS NULL AND x.imagen IS NULL ${noIn('producto')}
                    UNION ALL
                    SELECT 3, 'marca', x.id, NULL, x.nombre, NULL, NULL, NULL, NULL, NULL, NULL FROM "Marcas" x WHERE x.imagen IS NULL ${noIn('marca')}
                ) t ORDER BY orden, id LIMIT ${limite}`);
        }
        const puedeEditar = await puedeEditarInventario(acceso.sesion);
        return NextResponse.json({
            items: items.map((i) => ({ ...i, puntaje: i.puntaje === null ? null : Number(i.puntaje), url: i.imagen ? `${BLOB}/${i.imagen}` : null })),
            conteo: Object.fromEntries(Object.entries(conteo).map(([k, v]) => [k, Number(v)])),
            puedeEditar,
        });
    } catch (error) {
        console.error('Auditoría de imágenes:', error);
        return NextResponse.json({ error: 'No se pudo cargar la cola de fotos' }, { status: 500 });
    }
}

// Acciones: APROBAR (la foto está bien) · CAMBIAR (nueva foto ya subida a Blob) · QUITAR (borra la foto: vuelve a la cola de "faltan")
export async function POST(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    if (!(await puedeEditarInventario(acceso.sesion))) return NextResponse.json({ error: 'No tienes permiso para editar el inventario' }, { status: 403 });
    try {
        const { tipo, id, accion, imagen } = await request.json();
        const tabla = TABLAS[tipo];
        const refId = Number(id);
        if (!tabla || !Number.isInteger(refId)) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
        const [[fila]] = await consulta(`SELECT imagen FROM "${tabla}" WHERE id = :id`, { id: refId });
        if (!fila) return NextResponse.json({ error: 'No existe' }, { status: 404 });
        const uid = Number(acceso.sesion.id) || null;
        const marcar = (estado) => consulta(`INSERT INTO "ImagenAuditoria" (tipo, "refId", estado, "revisadoPor", "revisadoEn") VALUES (:tipo, :id, :estado, :uid, NOW())
            ON CONFLICT (tipo, "refId") DO UPDATE SET estado = :estado, "revisadoPor" = :uid, "revisadoEn" = NOW()`, { tipo, id: refId, estado, uid });
        // Solo se borran del Blob las imágenes que cargó el proceso automático (tienen fila de auditoría); las manuales no se tocan
        const borrarAnterior = async () => {
            if (!fila.imagen) return;
            const [[a]] = await consulta(`SELECT 1 ok FROM "ImagenAuditoria" WHERE tipo = :tipo AND "refId" = :id AND fuente IS NOT NULL`, { tipo, id: refId });
            if (a) { try { await del(`${BLOB}/${fila.imagen}`); } catch { /* ya no estaba */ } }
        };

        if (accion === 'APROBAR') {
            if (!fila.imagen) return NextResponse.json({ error: 'No tiene foto para aprobar' }, { status: 400 });
            await marcar('APROBADA');
        } else if (accion === 'CAMBIAR') {
            if (!NOMBRE_VALIDO.test(String(imagen || ''))) return NextResponse.json({ error: 'Nombre de imagen no válido' }, { status: 400 });
            if (fila.imagen !== imagen) await borrarAnterior();
            await consulta(`UPDATE "${tabla}" SET imagen = :imagen, "updatedAt" = NOW() WHERE id = :id`, { imagen, id: refId });
            await consulta(`UPDATE "ImagenAuditoria" SET fuente = NULL WHERE tipo = :tipo AND "refId" = :id`, { tipo, id: refId }); // ya es una foto manual
            await marcar('APROBADA');
        } else if (accion === 'QUITAR') {
            await borrarAnterior();
            await consulta(`UPDATE "${tabla}" SET imagen = NULL, "updatedAt" = NOW() WHERE id = :id`, { id: refId });
            await marcar('RECHAZADA');
        } else return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Auditoría de imágenes (acción):', error);
        return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
}
