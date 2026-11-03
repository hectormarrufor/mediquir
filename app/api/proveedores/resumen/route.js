import { NextResponse } from 'next/server';
import { Op, fn, col } from 'sequelize';
import { CuentaPorPagar, FacturaCompra, Proveedor } from '@/models';
import { rolDe } from '@/app/constants/roles';
import { requerirStaff } from '@/app/api/inventario/_lib';

// GET /api/proveedores/resumen -> todos los proveedores (activos e inactivos) con cuántas compras se les han registrado,
// la fecha de la última y lo que se les debe (en su moneda: dólares y bolívares por separado, sin convertir).
export async function GET() {
    const { sesion, error } = await requerirStaff();
    if (error) return error;
    const verDeuda = rolDe(sesion) !== 'vendedor'; // un vendedor no ve lo que se les debe (igual que en clientes)
    try {
        const [proveedores, compras, deudas] = await Promise.all([
            Proveedor.findAll({ order: [['nombre', 'ASC']], raw: true }),
            FacturaCompra.findAll({
                attributes: ['proveedorId', [fn('COUNT', col('id')), 'n'], [fn('MAX', col('fechaFactura')), 'ultima']],
                where: { proveedorId: { [Op.ne]: null } },
                group: ['proveedorId'],
                raw: true,
            }),
            CuentaPorPagar.findAll({
                attributes: ['proveedorId', 'moneda', [fn('SUM', col('saldoPendiente')), 'saldo']],
                where: { saldoPendiente: { [Op.gt]: 0.005 } },
                group: ['proveedorId', 'moneda'],
                raw: true,
            }),
        ]);

        const porCompras = new Map(compras.map((c) => [c.proveedorId, c]));
        const deuda = new Map();
        deudas.forEach((d) => {
            const actual = deuda.get(d.proveedorId) || { USD: 0, BS: 0 };
            actual[d.moneda === 'BS' ? 'BS' : 'USD'] += Number(d.saldo) || 0;
            deuda.set(d.proveedorId, actual);
        });

        return NextResponse.json({
            proveedores: proveedores.map((p) => ({
                ...p,
                nCompras: Number(porCompras.get(p.id)?.n) || 0,
                ultimaCompra: porCompras.get(p.id)?.ultima || null,
                ...(verDeuda ? { deudaUsd: deuda.get(p.id)?.USD || 0, deudaBs: deuda.get(p.id)?.BS || 0 } : {}),
            })),
            permisos: { editar: verDeuda, verDeuda },
        });
    } catch (err) {
        console.error('Error cargando proveedores:', err);
        return NextResponse.json({ error: 'No se pudieron cargar los proveedores' }, { status: 500 });
    }
}
