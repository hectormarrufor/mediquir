import { NextResponse } from 'next/server';
import { Notificacion, User, Empleado, Puesto, Departamento, sequelize } from '@/models';
import { Op } from 'sequelize';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function GET(request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;
        if (!token) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });

        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        
        const usuario = await User.findByPk(payload.id, {
            include: [{ 
                model: Empleado, 
                as: 'empleado',
                include: [{ 
                    model: Puesto, 
                    as: 'puestos', 
                    include: [{ model: Departamento, as: 'departamento' }] 
                }]
            }]
        });

        if (!usuario) return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 });

        const misPuestos = usuario.empleado?.puestos?.map(p => p.nombre) || [];
        const misDeptos = usuario.empleado?.puestos?.map(p => p.departamento?.nombre).filter(Boolean) || [];

        const misPuestosUnicos = [...new Set(misPuestos)];
        const misDeptosUnicos = [...new Set(misDeptos)];

        // Construimos las condiciones manualmente para evitar errores de tipo de Sequelize
        const conditions = [
            // A. Globales: No tiene departamento, ni puesto, ni usuario específico
            '("Notificacion"."departamentosObjetivo" IS NULL AND "Notificacion"."puestosObjetivo" IS NULL AND "Notificacion"."usuarioId" IS NULL)',
            
            // B. 🔥 NUEVA: Específicas directas al usuario autenticado
            `("Notificacion"."usuarioId" = ${payload.id})`
        ];

        // C. Si tiene departamentos, usamos el operador ?| de Postgres
        if (misDeptosUnicos.length > 0) {
            const deptosStr = misDeptosUnicos.map(d => `'${d}'`).join(',');
            conditions.push(`"Notificacion"."departamentosObjetivo"::jsonb ?| ARRAY[${deptosStr}]`);
        }

        // D. Si tiene puestos
        if (misPuestosUnicos.length > 0) {
            const puestosStr = misPuestosUnicos.map(p => `'${p}'`).join(',');
            conditions.push(`"Notificacion"."puestosObjetivo"::jsonb ?| ARRAY[${puestosStr}]`);
        }

        const whereClause = sequelize.literal(`(${conditions.join(' OR ')})`);

        const notificaciones = await Notificacion.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        return NextResponse.json({ success: true, data: notificaciones });

    } catch (error) {
        console.error('Error obteniendo notificaciones:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}