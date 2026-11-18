'use client';

import { useCallback, useEffect, useState } from 'react';

// Deja a la vista un momento el «¡Listo! Número de control asignado» antes de mandar a imprimir (para que quien imprime lo vea y lo compare con la forma)
export function usePausaListo(listo, ms = 2200) {
    const [visto, setVisto] = useState(false);
    useEffect(() => {
        if (!listo || visto) return undefined;
        const temporizador = setTimeout(() => setVisto(true), ms);
        return () => clearTimeout(temporizador);
    }, [listo, visto, ms]);
    return visto;
}

// Al imprimir una factura ('VENTA') o una nota ('NOTA') le asigna el número de control de la forma libre (correlativo compartido).
// Se asigna una sola vez por documento: si ya lo tiene, devuelve el que tiene. Estados:
//   inactivo -> asignando -> listo | pendiente (falta decir con qué número de control se empieza) | error
// `decision`: lo que administración eligió ante un número de control hueco ({ hueco: 122650 } = imprimir en ese número, { ignorar: true } = seguir con el siguiente)
export function useControlFiscal({ origen, id, activo, decision = null }) {
    const [estado, setEstado] = useState('inactivo');
    const [control, setControl] = useState(null);
    const [nuevo, setNuevo] = useState(false); // true = se le acaba de asignar (no lo tenía)
    const [mensaje, setMensaje] = useState('');

    const asignar = useCallback(async (reasignar = false) => {
        setEstado('asignando');
        setMensaje('');
        try {
            const res = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origen, id, reasignar, hueco: decision?.hueco || undefined, ignorarHuecos: decision?.ignorar ? true : undefined }) });
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) {
                if (cuerpo?.codigo === 'CONTROL_PENDIENTE') { setMensaje(cuerpo.error); setEstado('pendiente'); return null; }
                throw new Error(cuerpo?.error || 'No se pudo asignar el número de control');
            }
            setControl(cuerpo.numeroControl);
            setNuevo(Boolean(cuerpo.nuevo));
            setEstado('listo');
            return cuerpo.numeroControl;
        } catch (e) {
            setMensaje(e.message);
            setEstado('error');
            return null;
        }
    }, [origen, id, decision]);

    useEffect(() => { if (activo && estado === 'inactivo') asignar(false); }, [activo, estado, asignar]);

    return { estado, control, nuevo, mensaje, asignar };
}
