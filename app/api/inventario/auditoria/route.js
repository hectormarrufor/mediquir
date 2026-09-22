import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { puedeEditarInventario, requerirStaff } from '../_lib';
import { aplicarLote } from '../productos/_lote';

export const dynamic = 'force-dynamic';

// Auditoría unificada: por cada producto base, su FOTO y sus DATOS (costo, precios, empaque) en una sola ficha.
// La foto de un producto es (en este orden): la suya, la de su grupo de equivalencia o el logo de su marca.
const CAMPOS_EDITABLES = ['costoUsd', 'precio6', 'precio7', 'porcentajeIva', 'presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto'];
const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const consulta = (sql, replacements) => sequelize.query(sql, { replacements });
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const baseDe = (codigo) => String(codigo).split('-')[0];
const url = (n) => (n ? `${BLOB}/${n}` : null);

// Peso de cada alerta para ordenar la cola: lo dudoso primero. "Sin costo" pesa poco porque hoy ningún producto nuevo lo tiene.
const PESO = { DIF_REPORTE: 3, POSIBLE_CAJA: 3, P7_MENOR_P6: 3, P6_MENOR_COSTO: 3, SIN_P7: 3, NOTA: 2, SIN_COSTO: 0.5, FOTO_FALTA: 3, FOTO_DUDOSA: 3, FOTO_PENDIENTE: 1 };

function alertasDatos(f, ref, notas) {
    const a = [];
    const p6 = num(f.precio6), p7 = num(f.precio7), costo = num(f.costoUsd), upc = num(f.upc);
    if (costo <= 0) a.push('SIN_COSTO');
    if (p7 <= 0) a.push('SIN_P7');
    if (p7 > 0 && p6 > 0 && p7 < p6) a.push('P7_MENOR_P6');
    if (costo > 0 && p6 > 0 && p6 < costo) a.push('P6_MENOR_COSTO');
    const paq = /^paqx(\d+)$/.exec(f.presentacion || '');
    if ((upc >= 20 && p6 >= 1) || (paq && +paq[1] >= 50 && p6 > 0 && p6 < 0.5)) a.push('POSIBLE_CAJA');
    if (ref && num(ref.p6) > 0 && p6 > 0 && Math.abs(num(ref.p6) - p6) / p6 > 0.05) a.push('DIF_REPORTE');
    if (notas?.length) a.push('NOTA');
    return a;
}

// Foto efectiva de un producto y a qué entidad pertenece (la que se edita al cambiarla)
function fotoDe(f) {
    const entidad = f.imagen ? { tipo: 'producto', id: f.id } : f.gid ? { tipo: 'grupo', id: f.gid, nombre: f.gnombre } : { tipo: 'producto', id: f.id };
    const propia = f.imagen || (f.gid ? f.gimagen : null);
    const audit = entidad.tipo === 'grupo' ? { estado: f.ag_estado, puntaje: f.ag_puntaje, fuente: f.ag_fuente, pagina: f.ag_pagina } : { estado: f.ap_estado, puntaje: f.ap_puntaje, fuente: f.ap_fuente, pagina: f.ap_pagina };
    let estado;
    if (propia) estado = audit.estado === 'PENDIENTE' ? 'PENDIENTE' : 'OK';
    else estado = audit.estado === 'OMITIDA' ? 'OMITIDA' : 'FALTA';
    const origen = f.imagen ? 'producto' : propia ? 'grupo' : f.mimagen ? 'marca' : null;
    return { entidad, estado, origen, url: url(propia || f.mimagen), tienePropia: Boolean(propia), puntaje: audit.puntaje === null || audit.puntaje === undefined ? null : Number(audit.puntaje), fuente: audit.fuente, pagina: audit.pagina, marca: f.marca, grupo: f.gnombre || null };
}

function alertasFoto(foto) {
    if (foto.estado === 'FALTA') return ['FOTO_FALTA'];
    if (foto.estado === 'PENDIENTE') return foto.puntaje !== null && foto.puntaje < 0.7 ? ['FOTO_DUDOSA'] : ['FOTO_PENDIENTE'];
    return [];
}

export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    if (!(await puedeEditarInventario(acceso.sesion))) return NextResponse.json({ error: 'No tienes permiso para ver costos ni editar el inventario' }, { status: 403 });
    try {
        const { searchParams } = new URL(request.url);
        const filtro = searchParams.get('filtro') || 'pendiente';
        const excluir = new Set((searchParams.get('excluir') || '').split(',').filter(Boolean));
        const limite = Math.min(Number(searchParams.get('limite')) || 20, 50);

        const [filas] = await consulta(`
            SELECT p.id, p.codigo, p.nombre, p.imagen, p."grupoEquivalenciaId" gid, g.nombre gnombre, g.imagen gimagen, m.id marcaid, m.nombre marca, m.imagen mimagen, c.nombre categoria,
                   p."costoUsd", p.precio6, p.precio7, p."porcentajeIva" iva, p.presentacion, p."unidadesPorCaja" upc, p."cajasPorBulto" cpb, p."unidadesPorBulto" upb,
                   d.estado dato, d.referencia, d.notas,
                   ap.estado ap_estado, ap.puntaje ap_puntaje, ap.fuente ap_fuente, ap.pagina ap_pagina, ag.estado ag_estado, ag.puntaje ag_puntaje, ag.fuente ag_fuente, ag.pagina ag_pagina
              FROM "Productos" p
              LEFT JOIN "Marcas" m ON m.id = p."marcaId" LEFT JOIN "Categorias" c ON c.id = p."categoriaId" LEFT JOIN "GruposEquivalencia" g ON g.id = p."grupoEquivalenciaId"
              LEFT JOIN "DatoAuditoria" d ON d."productoId" = p.id
              LEFT JOIN "ImagenAuditoria" ap ON ap.tipo = 'producto' AND ap."refId" = p.id
              LEFT JOIN "ImagenAuditoria" ag ON ag.tipo = 'grupo' AND ag."refId" = p."grupoEquivalenciaId"
             ORDER BY p.codigo`);

        // Una ficha por producto base; las marcas -01, -02... comparten ficha (y pueden traer marcas distintas)
        const porBase = new Map();
        for (const f of filas) {
            const foto = fotoDe(f);
            const datoPend = f.dato === 'PENDIENTE';
            const fotoPend = foto.estado === 'PENDIENTE' || foto.estado === 'FALTA';
            if (!datoPend && !fotoPend && !(filtro === 'sin-foto' && foto.estado === 'OMITIDA')) continue;
            const b = baseDe(f.codigo);
            if (!porBase.has(b)) porBase.set(b, { base: b, rep: f, foto, variantes: [], idsDatos: [], marcas: new Map() });
            const x = porBase.get(b);
            // Aunque son "equivalentes", cada marca puede lucir distinto (una férula cambia según el fabricante):
            // se guarda la foto PROPIA de cada variante para poder verla y cambiarla aparte de la del grupo.
            x.variantes.push({ id: f.id, codigo: f.codigo, marca: f.marca, url: url(f.imagen) });
            if (f.marcaid) x.marcas.set(f.marcaid, { id: f.marcaid, nombre: f.marca, imagen: f.mimagen });
            if (datoPend) x.idsDatos.push(f.id);
        }
        const fichas = [...porBase.values()].map((x) => {
            const alertas = [...(x.rep.dato === 'PENDIENTE' ? alertasDatos(x.rep, x.rep.referencia, x.rep.notas) : []), ...alertasFoto(x.foto)];
            return { ...x, alertas, peso: alertas.reduce((s, k) => s + (PESO[k] || 0), 0) };
        });

        const [[m]] = [await consulta(`SELECT (SELECT count(*)::int FROM "DatoAuditoria" WHERE estado = 'APROBADO') aprobados,
            (SELECT count(*)::int FROM "Marcas" mm WHERE mm.imagen IS NULL AND NOT EXISTS (SELECT 1 FROM "ImagenAuditoria" i WHERE i.tipo = 'marca' AND i."refId" = mm.id AND i.estado = 'OMITIDA')) marcas_sin_logo`)].map((r) => r[0]);
        const conteo = {
            fichas: fichas.length, aprobados: m.aprobados, marcasSinLogo: m.marcas_sin_logo,
            dudosos: fichas.filter((x) => x.peso >= 2).length, fotosPorRevisar: fichas.filter((x) => x.foto.estado === 'PENDIENTE').length, fotosFaltan: fichas.filter((x) => x.foto.estado === 'FALTA').length,
            datosPendientes: fichas.filter((x) => x.idsDatos.length).length,
        };
        Object.keys(PESO).forEach((k) => { conteo[k] = fichas.filter((x) => x.alertas.includes(k)).length; });

        // Fichas de marcas sin logo (solo con ese filtro)
        if (filtro === 'marcas') {
            const [marcas] = await consulta(`SELECT mm.id, mm.nombre FROM "Marcas" mm WHERE mm.imagen IS NULL AND NOT EXISTS (SELECT 1 FROM "ImagenAuditoria" i WHERE i.tipo = 'marca' AND i."refId" = mm.id AND i.estado = 'OMITIDA') ORDER BY mm.nombre`);
            const items = marcas.filter((x) => !excluir.has(`marca:${x.id}`)).slice(0, limite).map((x) => ({
                clave: `marca:${x.id}`, tipo: 'marca', base: `marca:${x.id}`, id: x.id, nombre: x.nombre, categoria: null, variantes: [], marcas: [], datos: null, referencia: null, notas: [], alertas: ['FOTO_FALTA'],
                foto: { entidad: { tipo: 'marca', id: x.id, nombre: x.nombre }, estado: 'FALTA', origen: null, url: null, tienePropia: false, puntaje: null },
            }));
            return NextResponse.json({ conteo, items });
        }

        const elegidas = fichas
            .filter((x) => !excluir.has(x.base))
            .filter((x) => {
                if (filtro === 'pendiente') return true;
                if (filtro === 'dudoso') return x.peso >= 2;
                if (filtro === 'fotos') return x.foto.estado === 'PENDIENTE' || x.foto.estado === 'FALTA';
                if (filtro === 'sin-foto') return x.foto.estado === 'FALTA' || x.foto.estado === 'OMITIDA';
                if (filtro === 'datos') return x.idsDatos.length > 0;
                return x.alertas.includes(filtro);
            })
            .sort((a, b) => b.peso - a.peso || a.base.localeCompare(b.base))
            .slice(0, limite);

        return NextResponse.json({
            conteo,
            items: elegidas.map((x) => ({
                clave: x.base, tipo: 'producto', base: x.base, id: x.rep.id, codigo: x.rep.codigo, nombre: x.rep.nombre, categoria: x.rep.categoria,
                marcas: x.variantes.map((v) => v.marca).filter(Boolean), variantes: x.variantes, idsDatos: x.idsDatos, foto: x.foto, marcaImagen: url(x.rep.mimagen),
                // Foto del grupo de equivalencia y de cada marca de las variantes: se pueden ver y cambiar aparte de la foto "efectiva" de arriba
                grupo: x.rep.gid ? { id: x.rep.gid, nombre: x.rep.gnombre, url: url(x.rep.gimagen) } : null,
                marcasInfo: [...x.marcas.values()].map((mm) => ({ id: mm.id, nombre: mm.nombre, url: url(mm.imagen) })),
                datos: x.idsDatos.length ? { costoUsd: num(x.rep.costoUsd), precio6: num(x.rep.precio6), precio7: num(x.rep.precio7), porcentajeIva: num(x.rep.iva), presentacion: x.rep.presentacion, unidadesPorCaja: x.rep.upc, cajasPorBulto: x.rep.cpb, unidadesPorBulto: x.rep.upb } : null,
                referencia: x.rep.referencia, notas: x.rep.notas || [], alertas: x.alertas,
            })),
        });
    } catch (error) {
        console.error('Auditoría:', error);
        return NextResponse.json({ error: 'No se pudo cargar la cola de auditoría' }, { status: 500 });
    }
}

// APROBAR / GUARDAR { ids (productos con datos por revisar), cambios, foto: { tipo, id, estado: 'APROBADA' | 'OMITIDA' } }
// Los cambios de datos se aplican a todas las marcas de la ficha. El cambio de la FOTO en sí (subir, quitar) va por /api/inventario/imagenes-auditoria.
export async function POST(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    if (!(await puedeEditarInventario(acceso.sesion))) return NextResponse.json({ error: 'No tienes permiso para editar el inventario' }, { status: 403 });
    try {
        const { accion, ids, cambios, foto } = await request.json();
        const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
        if (lista.length > 60) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
        const uid = Number(acceso.sesion.id) || null;

        let pendiente = false;
        if (lista.length) {
            if (accion === 'GUARDAR') {
                const limpios = Object.fromEntries(Object.entries(cambios || {}).filter(([k]) => CAMPOS_EDITABLES.includes(k)));
                if (!Object.keys(limpios).length) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });
                // Con caja, el total del bulto se calcula solo (cajas x unidades por caja): no se envía
                const [[actual]] = await consulta(`SELECT "unidadesPorCaja" upc FROM "Productos" WHERE id = :id`, { id: lista[0] });
                const upcFinal = 'unidadesPorCaja' in limpios ? limpios.unidadesPorCaja : actual?.upc;
                if (Number(upcFinal) > 1) delete limpios.unidadesPorBulto; else if ('unidadesPorCaja' in limpios) limpios.cajasPorBulto = null;
                const r = await aplicarLote(lista.map((id) => ({ id, cambios: limpios })));
                if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 400 });
                if (r.errores?.length) return NextResponse.json({ error: r.errores[0].error }, { status: 400 });
            } else if (accion !== 'APROBAR') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
            // Si aún falta algo bloqueante (costo, precio 7...) no se cierra la ficha: queda PENDIENTE y reaparece
            // más adelante (después de las que nunca se han revisado), en vez de perderse por "aprobada" a medias.
            const [[fresca]] = await consulta(`SELECT "costoUsd" costo, precio6, precio7 FROM "Productos" WHERE id = :id`, { id: lista[0] });
            const costoF = num(fresca?.costo), p6F = num(fresca?.precio6), p7F = num(fresca?.precio7);
            pendiente = costoF <= 0 || p7F <= 0 || (p7F > 0 && p6F > 0 && p7F < p6F) || (costoF > 0 && p6F > 0 && p6F < costoF);
            await consulta(`UPDATE "DatoAuditoria" SET estado = :estado, "revisadoPor" = :uid, "revisadoEn" = NOW() WHERE "productoId" IN (:ids)`,
                { estado: pendiente ? 'PENDIENTE' : 'APROBADO', ids: lista, uid });
        }

        if (foto && ['producto', 'grupo', 'marca'].includes(foto.tipo) && ['APROBADA', 'OMITIDA'].includes(foto.estado)) {
            const tabla = { producto: 'Productos', grupo: 'GruposEquivalencia', marca: 'Marcas' }[foto.tipo];
            const [[e]] = await consulta(`SELECT imagen FROM "${tabla}" WHERE id = :id`, { id: Number(foto.id) });
            if (!e) return NextResponse.json({ error: 'No existe la entidad de la foto' }, { status: 404 });
            if (foto.estado === 'APROBADA' && !e.imagen) return NextResponse.json({ error: 'No tiene foto para aprobar' }, { status: 400 });
            await consulta(`INSERT INTO "ImagenAuditoria" (tipo, "refId", estado, "revisadoPor", "revisadoEn") VALUES (:tipo, :id, :estado, :uid, NOW())
                ON CONFLICT (tipo, "refId") DO UPDATE SET estado = :estado, "revisadoPor" = :uid, "revisadoEn" = NOW()`, { tipo: foto.tipo, id: Number(foto.id), estado: foto.estado, uid });
        }
        return NextResponse.json({ ok: true, pendiente });
    } catch (error) {
        console.error('Auditoría (acción):', error);
        return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
}
