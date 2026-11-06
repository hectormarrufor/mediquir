import sequelize from '@/sequelize';
import { randomUUID } from 'crypto';
import { ErrorCxc, FECHA } from './cxc';
import { fechaCaracas } from '@/app/constants/hora';

// Cuentas por cobrar manuales (deudas y préstamos que no vienen de una venta): su monto y sus abonos viven en la misma fila ("CuentasManuales").
// No tocan libros fiscales ni reportes de ventas. Igual que en las cuentas de ventas, la deuda no se sobrescribe: se baja con abonos y se sube con ajustes.
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function leerManual(id, transaction = null) {
    const [fila] = await sequelize.query(`SELECT * FROM "CuentasManuales" WHERE id = :id ${transaction ? 'FOR UPDATE' : ''}`, { replacements: { id: Number(id) }, type: sequelize.QueryTypes.SELECT, transaction });
    if (!fila) throw new ErrorCxc('Esa cuenta manual ya no existe', 404);
    return { ...fila, abonos: Array.isArray(fila.abonos) ? fila.abonos : [] };
}

export const saldoManual = (c) => r2(Number(c.montoUsd) - c.abonos.reduce((a, x) => a + Number(x.monto), 0));

export async function guardarAbonosManual(id, abonos, transaction) {
    await sequelize.query(`UPDATE "CuentasManuales" SET abonos = :abonos::jsonb, "updatedAt" = now() WHERE id = :id`, { replacements: { id: Number(id), abonos: JSON.stringify(abonos) }, transaction });
}

export function validarFecha(fecha) {
    const f = fecha || fechaCaracas();
    if (!FECHA.test(String(f)) || f > fechaCaracas()) throw new ErrorCxc('La fecha no es válida (no puede ser futura)');
    return f;
}

// Un abono (monto > 0, baja la deuda) o un ajuste (monto < 0, la sube)
export function nuevoAbono({ fecha, monto, metodo, referencia, notas, tipo }, saldoActual) {
    const importe = r2(monto);
    if (!Number.isFinite(importe) || importe === 0) throw new ErrorCxc('El monto debe ser distinto de cero');
    if (importe < 0 && tipo !== 'AJUSTE') throw new ErrorCxc('Un abono no puede ser negativo: para subir la deuda registra un ajuste');
    if (importe > 0 && importe > saldoActual + 0.005) throw new ErrorCxc(`El abono (${importe.toFixed(2)}) supera el saldo de la cuenta (${saldoActual.toFixed(2)})`, 409);
    return {
        id: randomUUID(), fecha: validarFecha(fecha), monto: importe,
        metodo: String(metodo || (tipo === 'AJUSTE' ? 'Ajuste de saldo' : 'Abono')).trim().slice(0, 60),
        referencia: String(referencia || '').trim().slice(0, 100) || null, notas: String(notas || '').trim().slice(0, 250) || null,
    };
}
