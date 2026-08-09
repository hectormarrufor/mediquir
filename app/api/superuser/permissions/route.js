// app/api/superuser/permissions/route.js
import { NextResponse } from 'next/server';
import db from '@/models';

export async function GET() {
    try {
        const permissions = await db.MenuPermission.findAll();

        const permissionsMap = permissions.reduce((acc, curr) => {
            acc[curr.href] = {
                departamentos: curr.allowedDepartments || [],
                puestos: curr.allowedPositions || [],
                // Transformamos los IDs numéricos a strings para el MultiSelect de Mantine
                usuarios: (curr.allowedUsers || []).map(String)
            };
            return acc;
        }, {});

        return NextResponse.json(permissionsMap);
    } catch (error) {
        console.error('❌ Error en GET MenuPermission:', error);
        return NextResponse.json({ error: 'Error al obtener permisos' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const entries = Object.entries(body);

        if (entries.length === 0) {
            return NextResponse.json({ error: 'Cuerpo vacío' }, { status: 400 });
        }

        const promises = entries.map(async ([ruta, data]) => {
            return db.MenuPermission.upsert({
                href: ruta,
                allowedDepartments: data.departamentos || [],
                allowedPositions: data.puestos || [] ,
                // Convertimos los strings del MultiSelect de vuelta a números para la base de datos
                allowedUsers: (data.usuarios || []).map(Number)
            });
        });

        await Promise.all(promises);

        return NextResponse.json({ message: 'Permisos de menú actualizados' });

    } catch (error) {
        console.error('❌ Error en POST MenuPermission:', error);
        return NextResponse.json({ 
            error: 'Error interno', 
            details: error.message 
        }, { status: 500 });
    }
}