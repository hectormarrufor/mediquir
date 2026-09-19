import { NextResponse } from 'next/server';
import { GrupoEquivalencia } from '@/models';
import { CAMPOS_GRUPO, validarCampo } from '@/app/constants/inventarioCampos';
import { requerirStaff, puedeEditarInventario } from '../../_lib';
import { cargarGrupos } from '../../_grupos';

// PATCH /api/inventario/grupos/:id   { cambios: { nombre?, stockMinimoGlobal?, imagen? } }
// Edita la fila "padre" de un grupo de equivalencia: su nombre, su foto y el stock mínimo del grupo.
export async function PATCH(request, { params }) {
    try {
        const { sesion, error } = await requerirStaff();
        if (error) return error;
        if (!(await puedeEditarInventario(sesion))) {
            return NextResponse.json({ error: 'No tienes permiso para editar el inventario' }, { status: 403 });
        }

        const { id } = await params;
        const { cambios } = await request.json();
        const valores = {};
        for (const [campo, crudo] of Object.entries(cambios || {})) {
            const r = validarCampo(campo, crudo, CAMPOS_GRUPO);
            if (!r.ok) return NextResponse.json({ error: `${campo}: ${r.error}` }, { status: 400 });
            valores[campo] = r.valor;
        }
        if (Object.keys(valores).length === 0) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });

        const grupo = await GrupoEquivalencia.findByPk(Number(id));
        if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });

        try {
            await grupo.update(valores);
        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') return NextResponse.json({ error: 'Ya existe otro grupo con ese nombre' }, { status: 409 });
            throw err;
        }

        const [actualizado] = (await cargarGrupos([grupo.id])).values();
        return NextResponse.json({ grupo: actualizado });
    } catch (err) {
        console.error('Error actualizando grupo:', err);
        return NextResponse.json({ error: 'Error al actualizar el grupo' }, { status: 500 });
    }
}
