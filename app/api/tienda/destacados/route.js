import { NextResponse } from 'next/server';
import { Producto, Marca, Categoria, GrupoEquivalencia } from '@/models';
import { Op } from 'sequelize';

export async function GET() {
    try {
        // 1. Los 10 Más Vendidos (Con desempate por los más recientes)
        const masVendidos = await Producto.findAll({
            where: { stockAlmacen: { [Op.gt]: 0 } }, // Opcional: Solo mostrar si hay stock
            order: [
                ['nroVentas', 'DESC'], 
                ['updatedAt', 'DESC'] // 🔥 El desempate mágico
            ],
            limit: 10,
           include: [
                { model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] }, // 🔥 Agregamos 'imagen'
                { model: Categoria, as: 'categoria', attributes: ['nombre'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['nombre', 'imagen'] } // 🔥 Agregamos el Grupo
            ]
        });

        // 2. Las Ofertas (Productos que tengan un precioDescuento asignado)
        const ofertas = await Producto.findAll({
            where: { 
                precioDescuento: { [Op.not]: null, [Op.gt]: 0 },
                stockAlmacen: { [Op.gt]: 0 }
            },
            order: [['updatedAt', 'DESC']],
            limit: 10,
            include: [
                { model: Marca, as: 'marca', attributes: ['nombre'] },
                { model: Categoria, as: 'categoria', attributes: ['nombre'] }
            ]
        });

        return NextResponse.json({ masVendidos, ofertas }, { status: 200 });
    } catch (error) {
        console.error("Error al cargar destacados:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}