// app/api/tareas/route.js
import { NextResponse } from 'next/server';
import db from '@/models';
import { Op } from 'sequelize';
import { notificarAdmins, notificarUsuario } from '@/app/handlers/notificar';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const esPresidencia = searchParams.get('esPresidencia') === 'true';

        if (!userId) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

        let whereCondition = {};

        // Si NO es presidencia, aplicamos el filtro para los Jefes y Empleados
        if (!esPresidencia) {
            whereCondition = {
                [Op.or]: [
                    { asignadoAId: userId },   // 1. Tareas que me toca hacer a mí
                    { creadoPorId: userId },   // 2. Tareas que YO delegué a mis súbditos (¡Esto es lo que faltaba!)
                    { asignadoAId: null }      // 3. Tareas Generales
                ]
            };
        }
        // Si esPresidencia es true, whereCondition es {}, por lo que ve toda la base de datos.

        const tareas = await db.Tarea.findAll({
            where: whereCondition,
            include: [
                { model: db.User, as: 'creador', include: [{ model: db.Empleado, as: 'empleado' }] },
                { model: db.User, as: 'responsable', include: [{ model: db.Empleado, as: 'empleado' }] }
            ],
            order: [['createdAt', 'DESC']]
        });

        return NextResponse.json(tareas);

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        let { titulo, descripcion, prioridad, fechaVencimiento, creadoPorId, asignadoAId } = body;

        // Si asignadoAId es 'general' o string vacío, lo forzamos a null
        if (asignadoAId === 'general' || asignadoAId === '') {
            asignadoAId = null;
        }

        const transaction = await db.sequelize.transaction();
        try {
            const usuario = asignadoAId ? await db.User.findByPk(asignadoAId, { transaction }) : null;
            
            if (usuario) {
                await usuario.reload({
                    include: [{ model: db.Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }], 
                    transaction
                });
            }
            
            if (asignadoAId && !usuario) {
                await transaction.rollback();
                return NextResponse.json({ error: 'usuario asignado no encontrado' }, { status: 404 });
            }

            const nuevaTarea = await db.Tarea.create({
                titulo, 
                descripcion, 
                prioridad, 
                fechaVencimiento, 
                creadoPorId,
                asignadoAId,
                estado: 'Pendiente'
            }, { transaction });

            
            await transaction.commit();
            if (asignadoAId) {
                await notificarUsuario(asignadoAId, {
                    title: 'Nueva Tarea Asignada',
                    body: `Tarea asignada a ${usuario.empleado.nombre} ${usuario.empleado.apellido}: ${titulo}. Por favor, revisa el panel de tareas.`,
                    url: `/superuser`
                });
            } else {
                await notificarAdmins({
                    title: 'Nueva Tarea General',
                    body: `Se ha creado una nueva tarea: "${titulo}". Por favor, revisa tu panel de tareas.`,
                    url: `/superuser`
                });
            }
            return NextResponse.json(nuevaTarea);
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Error creando tarea' }, { status: 500 });
    }
}