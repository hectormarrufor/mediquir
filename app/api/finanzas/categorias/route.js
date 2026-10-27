import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { CategoriaFinanciera } from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';
import { requerirStaff } from '../../inventario/_lib';

// GET: Listar todas las categorías (útil para los Selects del frontend). Un vendedor también las lee: al registrar un gasto
// en Compras tiene que elegir la categoría (antes la lista le llegaba vacía y no podía registrar el gasto).
export async function GET() {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const categorias = await CategoriaFinanciera.findAll({
            order: [['tipo', 'ASC'], ['nombre', 'ASC']]
        });
        return NextResponse.json(categorias, { status: 200 });
    } catch (error) {
        console.error("Error al obtener categorías financieras:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Crear una nueva categoría (Ej: Nómina, Papelería)
export async function POST(req) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const body = await req.json();
        const nombre = String(body.nombre || '').trim().slice(0, 80);
        const tipo = body.tipo;

        if (nombre.length < 3 || !['INGRESO', 'GASTO'].includes(tipo)) {
            return NextResponse.json({ error: 'Indica el nombre (mínimo 3 letras) y si es de ingresos o de gastos' }, { status: 400 });
        }
        // Sin duplicados (sin importar mayúsculas): devuelve la que ya existe
        const existente = await CategoriaFinanciera.findOne({ where: { nombre: { [Op.iLike]: nombre } } });
        if (existente) {
            if (existente.tipo !== tipo) return NextResponse.json({ error: `Ya existe "${existente.nombre}" como categoría de ${existente.tipo === 'INGRESO' ? 'ingresos' : 'gastos'}` }, { status: 409 });
            return NextResponse.json(existente, { status: 200 });
        }

        const nuevaCategoria = await CategoriaFinanciera.create({ nombre, tipo });
        return NextResponse.json(nuevaCategoria, { status: 201 });
    } catch (error) {
        console.error("Error al crear categoría financiera:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
