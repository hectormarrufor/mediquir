// Gestión logística de Notas de Crédito sobre facturas pendientes por empacar y pedidos ya empacados sin despachar.
// Imports relativos con extensión para permitir ejecución directa desde scripts de Node sin resolver alias "@/" en carga estática.
import db from '../../../models/index.js';
import { entregaDe } from '../../constants/presentaciones.js';

const { sequelize, Venta, VentaDetalle, Producto, SalidaInventario, VentaEmpaqueItem, NotaFiscal, NotaFiscalDetalle } = db;
const { Op } = db.Sequelize;

let initPromise = null;
let tieneAprobacionCol = null;

/**
 * Asegura en caliente las columnas nuevas de Ventas y NotasFiscales (idempotente, fuera de transacción).
 * También detecta si existe "aprobacionEstado" en NotasFiscales para filtrar notas pendientes de aprobación.
 */
export async function asegurarColumnasEmpaqueNotas() {
    if (!initPromise) {
        initPromise = (async () => {
            await sequelize.query(`ALTER TABLE "NotasFiscales" ADD COLUMN IF NOT EXISTS "afectaCxc" BOOLEAN`);
            await sequelize.query(`
                ALTER TABLE "Ventas"
                    ADD COLUMN IF NOT EXISTS "empaqueNcEstado" VARCHAR(20),
                    ADD COLUMN IF NOT EXISTS "empaqueNcResueltoAt" TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS "empaqueNcResueltoPorId" INTEGER,
                    ADD COLUMN IF NOT EXISTS "empaqueNcNota" TEXT,
                    ADD COLUMN IF NOT EXISTS "empaqueNcSnapshot" JSONB
            `);
            const cols = await sequelize.query(
                `SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'NotasFiscales' AND column_name = 'aprobacionEstado' LIMIT 1`,
                { type: sequelize.QueryTypes.SELECT },
            );
            tieneAprobacionCol = cols.length > 0;
        })().catch((err) => {
            initPromise = null;
            throw err;
        });
    }
    return initPromise;
}

// ------------------------------------------------------------------ Helpers SQL reutilizables
export function sqlNcActiva(alias = 'n') {
    const aprobacion = tieneAprobacionCol === false
        ? ''
        : ` AND (${alias}."aprobacionEstado" IS NULL OR ${alias}."aprobacionEstado" <> 'PENDIENTE')`;
    return `(${alias}."origen" = 'VENTA' AND ${alias}."tipo" = 'CREDITO' AND ${alias}."estado" = 'EMITIDA'${aprobacion})`;
}

export function sqlNcAfectaCxc(alias = 'n') {
    return `(COALESCE(${alias}."afectaCxc", (${alias}."abonoId" IS NOT NULL OR COALESCE(${alias}."saldoAFavorUsd", 0) > 0.005)) = TRUE)`;
}

/** Verdadero cuando la factura tiene al menos una NC activa que la acredita por completo (por monto o por todos sus renglones). */
export function sqlFacturaAnuladaTotalNc(vAlias = 'v') {
    const ncAct = sqlNcActiva('n');
    const ncAct2 = sqlNcActiva('n2');
    return `(${vAlias}."tipoDocumento" = 'FACTURA'
        AND EXISTS (SELECT 1 FROM "NotasFiscales" n WHERE n."ventaId" = ${vAlias}."id" AND ${ncAct})
        AND (
            (${vAlias}."totalFinal" - COALESCE((SELECT SUM(n."totalFinal") FROM "NotasFiscales" n WHERE n."ventaId" = ${vAlias}."id" AND ${ncAct}), 0)) <= 0.005
            OR (
                EXISTS (SELECT 1 FROM "VentaDetalles" d0 WHERE d0."ventaId" = ${vAlias}."id")
                AND (
                    SELECT COALESCE(SUM(GREATEST(0, d."cantidad" - COALESCE((
                        SELECT SUM(nd."cantidad")
                        FROM "NotaFiscalDetalles" nd
                        JOIN "NotasFiscales" n2 ON n2."id" = nd."notaId"
                        WHERE nd."ventaDetalleId" = d."id" AND ${ncAct2}
                    ), 0))), 0)
                    FROM "VentaDetalles" d
                    WHERE d."ventaId" = ${vAlias}."id"
                ) <= 0
            )
        ))`;
}

/** Unidades efectivas de un renglón descontando solo las NC activas que afectan CxC. */
export function sqlCantidadEfectivaDetalle(dAlias = 'd') {
    return `GREATEST(0, ${dAlias}."cantidad" - COALESCE((
        SELECT SUM(nd."cantidad")
        FROM "NotaFiscalDetalles" nd
        JOIN "NotasFiscales" n2 ON n2."id" = nd."notaId"
        WHERE nd."ventaDetalleId" = ${dAlias}."id" AND ${sqlNcActiva('n2')} AND ${sqlNcAfectaCxc('n2')}
    ), 0))`;
}

export function sqlExcluirDesarmado(vAlias = 'v') {
    return `COALESCE(${vAlias}."empaqueNcEstado", '') <> 'DESARMADO'`;
}

export function sqlExcluirPorEmpacar(vAlias = 'v') {
    return `NOT (${sqlFacturaAnuladaTotalNc(vAlias)}) AND COALESCE(${vAlias}."empaqueNcEstado", '') <> 'DESARMADO'`;
}

// ------------------------------------------------------------------ Presentaciones efectivas
/**
 * Devuelve una vista del renglón con la cantidad efectiva tras NC parciales que afecten CxC.
 * Si la cantidad no coincide con múltiplos exactos de la presentación pedida, limpia los campos
 * de presentación para que `entregaDe` calcule cajas/bultos/sueltas exactos con `desglose`.
 */
export function detalleEfectivo(detalle, cantidadEfectiva) {
    const base = typeof detalle?.get === 'function' ? detalle.get({ plain: true }) : { ...detalle };
    if (detalle?.producto && !base.producto) base.producto = detalle.producto;
    const cant = Math.max(0, Math.floor(Number(cantidadEfectiva) || 0));
    if (cant === Math.floor(Number(detalle?.cantidad) || 0)) {
        return { ...base, cantidad: cant };
    }
    const clave = base.presentacionPedida;
    const porPres = Number(base.unidadesPorPresentacion);
    if ((clave === 'CAJA' || clave === 'BULTO') && Number.isInteger(porPres) && porPres > 0 && cant > 0 && cant % porPres === 0) {
        return {
            ...base,
            cantidad: cant,
            presentacionPedida: clave,
            cantidadPresentacion: cant / porPres,
            unidadesPorPresentacion: porPres,
        };
    }
    return {
        ...base,
        cantidad: cant,
        presentacionPedida: null,
        cantidadPresentacion: null,
        unidadesPorPresentacion: null,
    };
}

// ------------------------------------------------------------------ Análisis en bloque / individual
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function notaAfectaCxc(nota) {
    if (nota.afectaCxc !== null && nota.afectaCxc !== undefined) return Boolean(nota.afectaCxc);
    return Boolean(nota.abonoId) || Number(nota.saldoAFavorUsd) > 0.005;
}

function construirAnalisis({ venta, meta, detalles, notas, resueltoPorNombre }) {
    const notasActivas = (notas || []).filter((n) => (
        n.origen === 'VENTA'
        && n.tipo === 'CREDITO'
        && n.estado === 'EMITIDA'
        && n.aprobacionEstado !== 'PENDIENTE'
    ));

    const totalAcreditadoMonto = r2(notasActivas.reduce((a, n) => a + Number(n.totalFinal || 0), 0));
    const acreditable = r2(Math.max(0, Number(venta.totalFinal || 0) - totalAcreditadoMonto));

    const acreditadoCxcPorDetalle = new Map();
    const acreditadoSinCxcPorDetalle = new Map();
    const acreditadoTotalPorDetalle = new Map();
    const devueltoPorDetalle = new Map();
    const pendienteDevolverPorDetalle = new Map();

    const notasInfo = notasActivas.map((n) => {
        const afecta = notaAfectaCxc(n);
        const dets = n.detalles || [];
        let unidades = 0;
        let tieneRenglonesFactura = false;
        for (const d of dets) {
            const q = Number(d.cantidad) || 0;
            unidades += q;
            if (!d.ventaDetalleId) continue;
            tieneRenglonesFactura = true;
            acreditadoTotalPorDetalle.set(d.ventaDetalleId, (acreditadoTotalPorDetalle.get(d.ventaDetalleId) || 0) + q);
            if (n.devuelveInventario) {
                devueltoPorDetalle.set(d.ventaDetalleId, (devueltoPorDetalle.get(d.ventaDetalleId) || 0) + q);
            }
            if (afecta) {
                acreditadoCxcPorDetalle.set(d.ventaDetalleId, (acreditadoCxcPorDetalle.get(d.ventaDetalleId) || 0) + q);
                if (!n.devuelveInventario) {
                    pendienteDevolverPorDetalle.set(d.ventaDetalleId, (pendienteDevolverPorDetalle.get(d.ventaDetalleId) || 0) + q);
                }
            } else {
                acreditadoSinCxcPorDetalle.set(d.ventaDetalleId, (acreditadoSinCxcPorDetalle.get(d.ventaDetalleId) || 0) + q);
            }
        }
        return {
            id: n.id,
            numero: n.numeroDocumento,
            fecha: n.fecha,
            createdAt: n.createdAt,
            totalFinal: Number(n.totalFinal || 0),
            moneda: n.moneda,
            motivo: n.motivo,
            afectaCxc: afecta,
            devuelveInventario: Boolean(n.devuelveInventario),
            tieneRenglonesFactura,
            unidades,
        };
    });

    const todasLineasAcreditadas = detalles.length > 0 && detalles.every(
        (d) => (Number(d.cantidad) - (acreditadoTotalPorDetalle.get(d.id) || 0)) <= 0,
    );
    const esAnulacionTotal = notasActivas.length > 0 && (acreditable <= 0.005 || todasLineasAcreditadas);
    const anuladaTotalParaEmpaque = esAnulacionTotal;

    let totalOriginal = 0;
    let totalRestante = 0;
    let devuelveInventarioPendienteTotal = 0;
    const cambios = detalles.map((d) => {
        const original = Math.max(0, Math.floor(Number(d.cantidad) || 0));
        const acredCxc = Math.min(original, acreditadoCxcPorDetalle.get(d.id) || 0);
        const acredSinCxc = Math.min(original - acredCxc, acreditadoSinCxcPorDetalle.get(d.id) || 0);
        const restante = esAnulacionTotal ? 0 : Math.max(0, original - acredCxc);
        const devuelto = devueltoPorDetalle.get(d.id) || 0;
        // Si es anulación total con afectaCxc=false, aún pueden quedar unidades sin reintegrar al inventario si la NC no marcó devuelveInventario
        const noDevuelto = esAnulacionTotal
            ? Math.max(0, original - devuelto)
            : Math.min(acredCxc, pendienteDevolverPorDetalle.get(d.id) || 0);

        let accion = 'SIN_CAMBIO';
        if (restante === 0 && original > 0) accion = 'RETIRAR_TODO';
        else if (restante < original) accion = 'REDUCIR';

        totalOriginal += original;
        totalRestante += restante;
        if (!d.isFicticio && d.afectaInventario !== false && d.productoId) {
            devuelveInventarioPendienteTotal += noDevuelto;
        }

        return {
            detalleId: d.id,
            productoId: d.productoId || null,
            isFicticio: Boolean(d.isFicticio),
            afectaInventario: d.afectaInventario !== false,
            nombre: d.isFicticio ? d.nombreFicticio : (d.producto?.nombre || 'Producto'),
            codigo: d.producto?.codigo || null,
            original,
            acreditadoCxc: esAnulacionTotal ? original : acredCxc,
            acreditadoSinCxc: esAnulacionTotal ? 0 : acredSinCxc,
            restante,
            sacar: Math.max(0, original - restante),
            accion,
            devueltoPorNc: devuelto,
            devuelveInventarioPendiente: noDevuelto,
        };
    });

    const modificaEmpaque = !esAnulacionTotal && cambios.some((c) => c.acreditadoCxc > 0);
    const tieneNc = notasActivas.length > 0;
    const tieneNcSoloInformativa = tieneNc && !esAnulacionTotal && !modificaEmpaque;

    const empaqueNcEstado = meta?.empaqueNcEstado || null;
    const snapshot = meta?.empaqueNcSnapshot || null;
    const snapshotIds = Array.isArray(snapshot?.notaIds) ? new Set(snapshot.notaIds.map(String)) : null;

    let estadoEfectivo = empaqueNcEstado;
    let bloqueaDespacho = false;
    const empacadaYAbierta = Boolean(venta.empacadoAt) && !['Completado', 'Cancelado'].includes(venta.statusDespacho);

    if (empacadaYAbierta) {
        const notasPostEmpaque = notasInfo.filter((n) => {
            if (snapshotIds) return !snapshotIds.has(String(n.id));
            return new Date(n.createdAt).getTime() > new Date(venta.empacadoAt).getTime();
        });
        const postAfectaCaja = notasPostEmpaque.some((n) => n.afectaCxc && n.tieneRenglonesFactura);
        if (!empaqueNcEstado) {
            if (esAnulacionTotal || postAfectaCaja) {
                estadoEfectivo = 'PENDIENTE';
                bloqueaDespacho = true;
            }
        } else if (empaqueNcEstado === 'PENDIENTE') {
            bloqueaDespacho = true;
        }
    }

    const renglonesOriginales = cambios.length;
    const renglonesEfectivos = cambios.filter((c) => c.restante > 0).length;

    return {
        tieneNc,
        esAnulacionTotal,
        anuladaTotalParaEmpaque,
        modificaEmpaque,
        tieneNcSoloInformativa,
        bloqueaDespacho,
        estadoEfectivo,
        empaqueNcEstado,
        totalOriginal,
        totalRestante,
        renglonesOriginales,
        renglonesEfectivos,
        devuelveInventarioPendienteTotal,
        notas: notasInfo,
        cambios,
        resolucion: meta?.empaqueNcResueltoAt ? {
            estado: empaqueNcEstado,
            fecha: meta.empaqueNcResueltoAt,
            usuarioId: meta.empaqueNcResueltoPorId || null,
            usuarioNombre: resueltoPorNombre || null,
            nota: meta.empaqueNcNota || null,
        } : null,
    };
}

/** Analiza en una sola tanda múltiples ventas (ideal para Despachos, Dashboard y Vendedor). */
export async function analizarEmpaquesBatch(ventaIds, transaction = undefined) {
    await asegurarColumnasEmpaqueNotas();
    const ids = [...new Set((ventaIds || []).filter(Boolean).map(String))];
    const mapa = new Map();
    if (!ids.length) return mapa;

    const sqlAprobNota = tieneAprobacionCol ? 'n."aprobacionEstado"' : 'NULL::text AS "aprobacionEstado"';
    const [ventasMeta, detalles, notasRows] = await Promise.all([
        sequelize.query(
            `SELECT v."id", v."tipoDocumento"::text AS "tipoDocumento", v."statusDespacho"::text AS "statusDespacho",
                    v."tipoEntrega"::text AS "tipoEntrega", v."tipoVenta"::text AS "tipoVenta",
                    v."totalFinal"::float AS "totalFinal", v."empacadoAt",
                    v."empaqueNcEstado", v."empaqueNcResueltoAt", v."empaqueNcResueltoPorId", v."empaqueNcNota", v."empaqueNcSnapshot",
                    COALESCE(e."nombre" || ' ' || e."apellido", u."user") AS "resueltoPorNombre"
             FROM "Ventas" v
             LEFT JOIN "Usuarios" u ON u."id" = v."empaqueNcResueltoPorId"
             LEFT JOIN "Empleados" e ON e."id" = u."empleadoId"
             WHERE v."id" IN (:ids)`,
            { replacements: { ids }, type: sequelize.QueryTypes.SELECT, transaction },
        ),
        VentaDetalle.findAll({
            where: { ventaId: ids },
            include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigo'] }],
            transaction,
        }),
        sequelize.query(
            `SELECT n."id", n."ventaId", n."tipo", n."origen", n."estado", n."numeroDocumento", n."fecha", n."createdAt",
                    n."totalFinal"::float AS "totalFinal", n."moneda", n."motivo", n."devuelveInventario",
                    n."afectaCxc", n."abonoId", n."saldoAFavorUsd"::float AS "saldoAFavorUsd", ${sqlAprobNota}
             FROM "NotasFiscales" n
             WHERE n."ventaId" IN (:ids) AND n."origen" = 'VENTA' AND n."tipo" = 'CREDITO'
             ORDER BY n."createdAt" ASC`,
            { replacements: { ids }, type: sequelize.QueryTypes.SELECT, transaction },
        ),
    ]);

    const notaIds = notasRows.map((n) => n.id);
    const notaDetalles = notaIds.length
        ? await NotaFiscalDetalle.findAll({ where: { notaId: notaIds }, raw: true, transaction })
        : [];
    const detsPorNota = new Map();
    for (const nd of notaDetalles) {
        if (!detsPorNota.has(nd.notaId)) detsPorNota.set(nd.notaId, []);
        detsPorNota.get(nd.notaId).push(nd);
    }

    const notasPorVenta = new Map();
    for (const n of notasRows) {
        if (!notasPorVenta.has(n.ventaId)) notasPorVenta.set(n.ventaId, []);
        notasPorVenta.get(n.ventaId).push({ ...n, detalles: detsPorNota.get(n.id) || [] });
    }

    const detallesPorVenta = new Map();
    for (const d of detalles) {
        if (!detallesPorVenta.has(d.ventaId)) detallesPorVenta.set(d.ventaId, []);
        detallesPorVenta.get(d.ventaId).push(d);
    }

    for (const v of ventasMeta) {
        mapa.set(String(v.id), construirAnalisis({
            venta: v,
            meta: v,
            detalles: detallesPorVenta.get(v.id) || [],
            notas: notasPorVenta.get(v.id) || [],
            resueltoPorNombre: v.resueltoPorNombre,
        }));
    }
    return mapa;
}

/** Analiza una sola venta (puede pasar la instancia de Venta o su id). */
export async function analizarEmpaqueConNotas(ventaOrId, transaction = undefined) {
    const id = typeof ventaOrId === 'string' ? ventaOrId : ventaOrId?.id;
    if (!id) return null;
    const mapa = await analizarEmpaquesBatch([id], transaction);
    return mapa.get(String(id)) || null;
}

// ------------------------------------------------------------------ Hooks en ciclo de vida de NC y empaque
async function sincronizarSalidasPorProducto({ ventaId, cambios, activarPendientes = false, transaction: t }) {
    const porProducto = new Map();
    for (const c of cambios) {
        if (c.isFicticio || c.afectaInventario === false || !c.productoId) continue;
        const pid = Number(c.productoId);
        porProducto.set(pid, (porProducto.get(pid) || 0) + c.restante);
    }
    for (const [productoId, sumaRestante] of porProducto) {
        const salidas = await SalidaInventario.findAll({
            where: { ventaId, productoId },
            order: [['id', 'ASC']],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!salidas.length) continue;
        const principal = salidas[0];
        if (sumaRestante <= 0) {
            for (const s of salidas) {
                if (s.estado === 'Pendiente') {
                    s.estado = 'Cancelada';
                    await s.save({ transaction: t });
                }
            }
        } else {
            if (principal.estado === 'Pendiente' || (activarPendientes && principal.estado === 'Cancelada')) {
                principal.estado = 'Pendiente';
                principal.cantidad = sumaRestante;
                await principal.save({ transaction: t });
            }
            for (let i = 1; i < salidas.length; i++) {
                if (salidas[i].estado === 'Pendiente') {
                    salidas[i].estado = 'Cancelada';
                    await salidas[i].save({ transaction: t });
                }
            }
        }
    }
}

/**
 * Sincroniza logística, salidas pendientes, evidencia parcial e indicadores post-empaque tras emitir o aprobar una NC.
 * Retorna `avisoPostEmpaque` (o null) para que el endpoint lo notifique después del commit.
 */
export async function sincronizarLogisticaTrasNota({ venta, nota, afectaCxc, deNotas = false, transaction: t }) {
    await asegurarColumnasEmpaqueNotas();
    if (nota?.id) {
        await sequelize.query(
            `UPDATE "NotasFiscales" SET "afectaCxc" = :afecta WHERE id = :id`,
            { replacements: { id: nota.id, afecta: Boolean(afectaCxc) }, transaction: t },
        );
    }
    if (!venta?.id) return null;
    if (['Completado', 'Cancelado'].includes(venta.statusDespacho) || venta.tipoEntrega === 'sitio') {
        return null;
    }

    const analisis = await analizarEmpaqueConNotas(venta.id, t);
    if (!analisis) return null;

    // 1) Pedido aún NO empacado
    if (!venta.empacadoAt) {
        if (analisis.anuladaTotalParaEmpaque || deNotas) {
            await SalidaInventario.update(
                { estado: 'Cancelada' },
                { where: { ventaId: venta.id, estado: 'Pendiente' }, transaction: t },
            );
            await VentaEmpaqueItem.destroy({ where: { ventaId: venta.id }, transaction: t });
            if (venta.fotoCajaAbiertaUrl || venta.fotoCajaSelladaUrl || venta.empaqueIniciadoAt || venta.empaqueVerificado) {
                venta.fotoCajaAbiertaUrl = null;
                venta.fotoCajaSelladaUrl = null;
                venta.empaqueIniciadoAt = null;
                venta.empaqueVerificado = false;
                await venta.save({ transaction: t });
            }
            return null;
        }

        if (afectaCxc && analisis.modificaEmpaque) {
            await sincronizarSalidasPorProducto({ ventaId: venta.id, cambios: analisis.cambios, transaction: t });
            const itemsExistentes = await VentaEmpaqueItem.findAll({ where: { ventaId: venta.id }, transaction: t });
            const porDet = new Map(itemsExistentes.map((it) => [it.ventaDetalleId, it]));
            let invalidoFotos = false;
            for (const c of analisis.cambios) {
                const it = porDet.get(c.detalleId);
                if (!it) continue;
                if (c.restante <= 0 || Number(it.cantidadPedida) !== c.restante) {
                    await it.destroy({ transaction: t });
                    invalidoFotos = true;
                }
            }
            if (invalidoFotos && (venta.fotoCajaAbiertaUrl || venta.fotoCajaSelladaUrl || venta.empaqueVerificado)) {
                venta.fotoCajaAbiertaUrl = null;
                venta.fotoCajaSelladaUrl = null;
                venta.empaqueVerificado = false;
                await venta.save({ transaction: t });
            }
        }
        return null;
    }

    // 2) Pedido YA empacado y todavía sin despachar
    if (deNotas) {
        await sequelize.query(
            `UPDATE "Ventas"
             SET "empaqueNcEstado" = 'DESARMADO',
                 "empaqueNcResueltoAt" = NOW(),
                 "empaqueNcResueltoPorId" = NULL,
                 "empaqueNcNota" = 'Anulación total: el despacho volvió a la nota de entrega',
                 "empaqueNcSnapshot" = CAST(:snap AS jsonb)
             WHERE id = :id`,
            {
                replacements: { id: venta.id, snap: JSON.stringify({ notaIds: analisis.notas.map((n) => n.id) }) },
                transaction: t,
            },
        );
        return null;
    }

    const detsNota = nota?.id
        ? await NotaFiscalDetalle.findAll({ where: { notaId: nota.id }, attributes: ['ventaDetalleId'], raw: true, transaction: t })
        : [];
    const tieneRenglonFactura = detsNota.some((d) => Boolean(d.ventaDetalleId));
    const impactaCaja = analisis.esAnulacionTotal || (Boolean(afectaCxc) && tieneRenglonFactura);
    if (!impactaCaja) return null;

    await sequelize.query(
        `UPDATE "Ventas"
         SET "empaqueNcEstado" = 'PENDIENTE',
             "empaqueNcResueltoAt" = NULL,
             "empaqueNcResueltoPorId" = NULL
         WHERE id = :id`,
        { replacements: { id: venta.id }, transaction: t },
    );

    return {
        ventaId: venta.id,
        numeroVenta: venta.numeroDocumento,
        numeroNota: nota?.numeroDocumento || 'NC',
        esTotal: analisis.esAnulacionTotal,
        empacadorId: venta.empacadorId || null,
        vendedorId: venta.vendedorId || null,
        agencia: venta.quienRetira || null,
    };
}

/**
 * Reconcilia el estado logístico si una Nota de Crédito emitida es posteriormente ANULADA.
 */
export async function reconciliarLogisticaTrasAnularNota({ venta, notaAnulada, transaction: t }) {
    await asegurarColumnasEmpaqueNotas();
    if (!venta?.id || !notaAnulada || notaAnulada.origen !== 'VENTA' || notaAnulada.tipo !== 'CREDITO') return;
    if (['Completado', 'Cancelado'].includes(venta.statusDespacho) || venta.tipoEntrega === 'sitio') return;

    const analisis = await analizarEmpaqueConNotas(venta.id, t);
    if (!analisis) return;

    if (!venta.empacadoAt) {
        if (!analisis.anuladaTotalParaEmpaque) {
            await sincronizarSalidasPorProducto({
                ventaId: venta.id,
                cambios: analisis.cambios,
                activarPendientes: true,
                transaction: t,
            });
        }
        return;
    }

    const [meta] = await sequelize.query(
        `SELECT "empaqueNcEstado", "empaqueNcSnapshot" FROM "Ventas" WHERE id = :id`,
        { replacements: { id: venta.id }, type: sequelize.QueryTypes.SELECT, transaction: t },
    );
    const estadoActual = meta?.empaqueNcEstado || null;
    if (estadoActual === 'PENDIENTE') {
        const snapshotIds = Array.isArray(meta?.empaqueNcSnapshot?.notaIds)
            ? new Set(meta.empaqueNcSnapshot.notaIds.map(String))
            : null;
        const postAfectaCaja = (analisis.notas || []).some((n) => {
            const esPost = snapshotIds
                ? !snapshotIds.has(String(n.id))
                : new Date(n.createdAt).getTime() > new Date(venta.empacadoAt).getTime();
            return esPost && n.afectaCxc && n.tieneRenglonesFactura;
        });
        if (!analisis.esAnulacionTotal && !postAfectaCaja) {
            await sequelize.query(
                `UPDATE "Ventas" SET "empaqueNcEstado" = NULL, "empaqueNcResueltoAt" = NULL, "empaqueNcResueltoPorId" = NULL, "empaqueNcNota" = NULL WHERE id = :id`,
                { replacements: { id: venta.id }, transaction: t },
            );
        }
    } else if (estadoActual === 'DESARMADO' || estadoActual === 'AJUSTADO') {
        await sequelize.query(
            `UPDATE "Ventas"
             SET "empaqueNcEstado" = 'PENDIENTE',
                 "empaqueNcResueltoAt" = NULL,
                 "empaqueNcResueltoPorId" = NULL,
                 "empaqueNcNota" = 'Se anuló una nota de crédito después de modificar/desarmar la caja: revisa o re-empaca el pedido.'
             WHERE id = :id`,
            { replacements: { id: venta.id }, transaction: t },
        );
    }
}

/** Guarda el snapshot de NCs existentes al firmar el empaque para distinguir futuras NCs post-empaque. */
export async function registrarSnapshotEmpaque(venta, transaction) {
    await asegurarColumnasEmpaqueNotas();
    const analisis = await analizarEmpaqueConNotas(venta.id, transaction);
    const notaIds = analisis?.notas?.map((n) => n.id) || [];
    await sequelize.query(
        `UPDATE "Ventas"
         SET "empaqueNcEstado" = NULL,
             "empaqueNcSnapshot" = CAST(:snap AS jsonb)
         WHERE id = :id`,
        { replacements: { id: venta.id, snap: JSON.stringify({ notaIds }) }, transaction },
    );
}

/** Envía alertas push/internas cuando una NC retiene una caja empacada pendiente de despacho. Nunca falla. */
export async function notificarCajaRetenidaPorNc(aviso) {
    if (!aviso?.ventaId) return;
    try {
        const { notificarCabezas, notificarUsuario } = await import('../../handlers/notificar.js');
        const titulo = aviso.esTotal
            ? `⛔ NO despachar ${aviso.numeroVenta} (NC total)`
            : `⚠️ Revisar caja ${aviso.numeroVenta} por NC parcial`;
        const cuerpo = aviso.esTotal
            ? `Se emitió ${aviso.numeroNota} (anulación total) sobre ${aviso.numeroVenta}, que ya estaba empacado. Desarma la caja en Despachos antes de entregar.`
            : `Se emitió ${aviso.numeroNota} sobre ${aviso.numeroVenta}, que ya estaba empacado. Gestiona el ajuste de la caja en Despachos antes de entregar.`;
        const url = '/superuser/ventas/despachos';

        await notificarCabezas({ title: titulo, body: cuerpo, url, tipo: 'Alerta' }).catch(() => null);
        const destinatarios = [...new Set([aviso.empacadorId, aviso.vendedorId].map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        for (const uid of destinatarios) {
            await notificarUsuario(uid, { title: titulo, body: cuerpo, url, tipo: 'Alerta' }).catch(() => null);
        }
    } catch (e) {
        console.error('No se pudo notificar caja retenida por NC:', e?.message || e);
    }
}
