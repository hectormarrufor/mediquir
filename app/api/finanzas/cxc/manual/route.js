import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { r2, validarFecha } from '../../../_lib/cxcManual';
import { ErrorCxc } from '../../../_lib/cxc';

export const dynamic = 'force-dynamic';

const normNombre = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\bC\.?\s?A\.?\b|\bS\.?\s?A\.?\b/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();

// Crea una cuenta por cobrar manual (deuda, préstamo...): { cliente, concepto, monto, fecha, vence, observacion, clienteId? }
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const cliente = String(b.cliente || '').trim().slice(0, 200);
        if (cliente.length < 2) throw new ErrorCxc('Escribe a quién se le cobra');
        const monto = r2(b.monto);
        if (!(monto > 0)) throw new ErrorCxc('El monto debe ser mayor a 0');
        const concepto = String(b.concepto || 'DEUDA').trim().slice(0, 120) || 'DEUDA';
        const fecha = validarFecha(b.fecha);
        const vence = b.vence ? validarFecha(b.vence).toString() : fecha;
        // Si el nombre coincide con un cliente, se relaciona con él (sale agrupado con sus demás cuentas)
        let clienteId = Number(b.clienteId) || null;
        if (!clienteId) {
            const clientes = await sequelize.query(`SELECT id, nombre FROM "Clientes"`, { type: sequelize.QueryTypes.SELECT });
            clienteId = clientes.find((c) => normNombre(c.nombre) === normNombre(cliente))?.id || null;
        }
        const [[fila]] = await sequelize.query(
            `INSERT INTO "CuentasManuales" ("clienteId", "clienteTexto", concepto, "montoUsd", fecha, vence, observacion, "createdAt", "updatedAt")
             VALUES (:clienteId, :cliente, :concepto, :monto, :fecha, :vence, :obs, now(), now()) RETURNING id`,
            { replacements: { clienteId, cliente, concepto, monto, fecha, vence, obs: String(b.observacion || '').trim().slice(0, 500) || null } },
        );
        return NextResponse.json({ ok: true, id: fila.id, relacionada: Boolean(clienteId) }, { status: 201 });
    } catch (error) {
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Crear cuenta manual:', error);
        return NextResponse.json({ error: 'No se pudo crear la cuenta' }, { status: 500 });
    }
}
