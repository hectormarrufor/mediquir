import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { MovimientoFinanciero, CategoriaFinanciera, BcvPrecioHistorico } from '@/models';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

class ErrorMovimiento extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// GET: movimientos de caja (ingresos y gastos). Con ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD trae solo ese periodo.
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const params = new URL(request.url).searchParams;
        const desde = params.get('desde');
        const hasta = params.get('hasta');
        const where = FECHA.test(desde || '') && FECHA.test(hasta || '') ? { fecha: { [Op.between]: [desde, hasta] } } : {};
        const movimientos = await MovimientoFinanciero.findAll({
            where,
            include: [
                { model: CategoriaFinanciera, as: 'categoria', attributes: ['nombre', 'tipo'] }
            ],
            order: [['fecha', 'DESC'], ['createdAt', 'DESC']]
        });

        return NextResponse.json(movimientos, { status: 200 });
    } catch (error) {
        console.error("Error al obtener flujo de caja:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Registrar un Gasto o Ingreso Manual
export async function POST(req) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();

    try {
        const body = await req.json();
        const { tipo, fecha, metodoPago, referencia, montoUsd, descripcion, categoriaId } = body;

        if (!['INGRESO', 'GASTO'].includes(tipo)) throw new ErrorMovimiento('Tipo de movimiento inválido');
        if (!FECHA.test(String(fecha || ''))) throw new ErrorMovimiento('Fecha inválida');
        if (!metodoPago) throw new ErrorMovimiento('Indica el método de pago');
        const montoUsdFloat = Math.round(parseFloat(montoUsd) * 100) / 100;
        if (!(montoUsdFloat > 0)) throw new ErrorMovimiento('El monto debe ser mayor a 0');
        const categoria = await CategoriaFinanciera.findByPk(Number(categoriaId) || 0, { transaction: t });
        if (!categoria) throw new ErrorMovimiento('Elige una categoría');
        if (categoria.tipo !== tipo) throw new ErrorMovimiento(`La categoría "${categoria.nombre}" es de ${categoria.tipo === 'INGRESO' ? 'ingresos' : 'gastos'}`);

        // 1. Tasa BCV de la fecha del movimiento. El BCV no publica los fines de semana ni los feriados: entonces vale
        //    la última tasa publicada antes de esa fecha (antes no dejaba registrar nada un sábado o un domingo).
        const tasaHistorica = await BcvPrecioHistorico.findOne({
            where: { fecha: { [Op.lte]: fecha } },
            order: [['fecha', 'DESC'], ['hora', 'DESC']],
            transaction: t
        });

        if (!tasaHistorica) {
            throw new ErrorMovimiento(`No hay tasa BCV registrada para el ${fecha.split('-').reverse().join('/')} ni antes.`);
        }

        const tasaBcv = parseFloat(tasaHistorica.monto);

        // 2. Calcular los Bolívares
        const montoVesCalculado = Math.round(montoUsdFloat * tasaBcv * 100) / 100;

        // 3. Registrar el movimiento en el Libro Mayor
        const nuevoMovimiento = await MovimientoFinanciero.create({
            tipo,
            fecha,
            metodoPago,
            referencia: String(referencia || '').trim().slice(0, 100) || null,
            montoUsd: montoUsdFloat,
            tasaBcvAplicada: tasaBcv,
            montoVes: montoVesCalculado,
            descripcion: String(descripcion || '').trim() || null,
            categoriaId: categoria.id,
            // ventaId y abonoId quedan en NULL porque es un registro manual
        }, { transaction: t });

        await t.commit();

        return NextResponse.json({
            message: 'Movimiento registrado exitosamente',
            movimiento: nuevoMovimiento
        }, { status: 201 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorMovimiento) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Error al registrar movimiento:", error);
        return NextResponse.json({ error: 'No se pudo registrar el movimiento' }, { status: 500 });
    }
}
