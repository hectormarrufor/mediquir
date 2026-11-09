import { NextResponse } from 'next/server';
import { NotaFiscal } from '@/models';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';
import { facturasParaCompensar, saldoDisponibleDeNota } from '@/app/api/_lib/notasFiscales';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Lo que se puede compensar con el saldo a favor de una nota de crédito: cuánto queda por usar y las facturas pendientes del mismo cliente (de la más antigua a la más reciente).
//   GET → { disponibleUsd, facturas: [{ ventaId, documento, vence, saldoUsd }] }
export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
        const nota = await NotaFiscal.findByPk(id);
        if (!nota) return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
        const vigente = nota.estado === 'EMITIDA' && nota.tipo === 'CREDITO' && nota.origen === 'VENTA';
        const disponibleUsd = vigente ? await saldoDisponibleDeNota(nota) : 0;
        const facturas = disponibleUsd > 0.005 ? await facturasParaCompensar(nota) : [];
        return NextResponse.json({ disponibleUsd, facturas: facturas.map((f) => ({ ventaId: f.ventaId, documento: f.documento, vence: f.vence ? f.vence.slice(0, 10) : null, saldoUsd: f.saldoUsd })) });
    } catch (error) {
        console.error('Compensación de una nota:', error);
        return NextResponse.json({ error: 'No se pudo cargar la compensación' }, { status: 500 });
    }
}
