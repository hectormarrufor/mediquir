'use client';

import { useCallback, useEffect, useState } from 'react';

// Al imprimir una factura ('VENTA') o una nota ('NOTA') le asigna el número de control de la forma libre (correlativo compartido).
// Se asigna una sola vez por documento: si ya lo tiene, devuelve el que tiene. Estados:
//   inactivo -> asignando -> listo | pendiente (falta decir con qué número de control se empieza) | error
export function useControlFiscal({ origen, id, activo }) {
    const [estado, setEstado] = useState('inactivo');
    const [control, setControl] = useState(null);
    const [mensaje, setMensaje] = useState('');

    const asignar = useCallback(async (reasignar = false) => {
        setEstado('asignando');
        setMensaje('');
        try {
            const res = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origen, id, reasignar }) });
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) {
                if (cuerpo?.codigo === 'CONTROL_PENDIENTE') { setMensaje(cuerpo.error); setEstado('pendiente'); return null; }
                throw new Error(cuerpo?.error || 'No se pudo asignar el número de control');
            }
            setControl(cuerpo.numeroControl);
            setEstado('listo');
            return cuerpo.numeroControl;
        } catch (e) {
            setMensaje(e.message);
            setEstado('error');
            return null;
        }
    }, [origen, id]);

    useEffect(() => { if (activo && estado === 'inactivo') asignar(false); }, [activo, estado, asignar]);

    return { estado, control, mensaje, asignar };
}
