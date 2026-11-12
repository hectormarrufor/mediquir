'use client';

import React, { useState } from 'react';
import { Alert, Button, Checkbox, Stack, Text, TextInput } from '@mantine/core';
import { IconFileInvoice, IconTruckDelivery } from '@tabler/icons-react';
import FirmaPad from '@/app/components/ui/FirmaPad';

// Entrega de la mercancía al chofer o agencia: sus datos, su firma dibujada en el teléfono de quien entrega
// y la confirmación de que también se le da la factura impresa. Queda como evidencia en la venta.
export default function EntregaChoferForm({ numeroDocumento, empresaInicial = '', cargando, onConfirmar, children }) {
    const [v, setV] = useState({ choferNombre: '', choferCedula: '', choferEmpresa: empresaInicial, facturaEntregada: false });
    const [firma, setFirma] = useState(null);
    const [errores, setErrores] = useState({});
    const set = (campo) => (e) => setV((p) => ({ ...p, [campo]: e.currentTarget.value }));

    const enviar = () => {
        const err = {};
        if (v.choferNombre.trim().length < 3) err.choferNombre = 'Escribe el nombre completo del chofer';
        if (v.choferCedula.trim().length < 5) err.choferCedula = 'Escribe la cédula del chofer';
        if (v.choferEmpresa.trim().length < 2) err.choferEmpresa = 'Escribe la empresa o agencia para la que trabaja';
        if (!firma) err.firma = 'Falta la firma del chofer';
        if (!v.facturaEntregada) err.facturaEntregada = 'Confirma que le entregas la factura';
        setErrores(err);
        if (Object.keys(err).length) return;
        onConfirmar({ ...v, firma });
    };

    return (
        <Stack gap="sm">
            <Alert color="grape" variant="light" icon={<IconTruckDelivery size={18} />} p="xs">
                Vas a entregar el pedido <b>{numeroDocumento}</b>. Estos datos y la firma quedan guardados como evidencia de la entrega.
            </Alert>
            <TextInput label="Nombre del chofer" withAsterisk value={v.choferNombre} onChange={set('choferNombre')} error={errores.choferNombre} maxLength={120} autoComplete="off" />
            <TextInput label="Cédula del chofer" withAsterisk placeholder="V-12345678" value={v.choferCedula} onChange={set('choferCedula')} error={errores.choferCedula} maxLength={30} autoComplete="off" />
            <TextInput label="Empresa o agencia para la que trabaja" withAsterisk placeholder="Ej: MRW, Zoom, Tealca, transporte propio del cliente" value={v.choferEmpresa} onChange={set('choferEmpresa')} error={errores.choferEmpresa} maxLength={120} autoComplete="off" />
            {children}
            <Text size="sm" fw={600}>Firma del chofer *</Text>
            <FirmaPad onChange={setFirma} error={errores.firma} />
            <Checkbox
                color="grape" size="md" error={errores.facturaEntregada}
                checked={v.facturaEntregada} onChange={(e) => setV((p) => ({ ...p, facturaEntregada: e.currentTarget.checked }))}
                label={<Text size="sm" fw={600}><IconFileInvoice size={16} style={{ verticalAlign: 'middle' }} /> ¿Estás seguro de que le estás entregando al chofer la factura impresa ({numeroDocumento})? Marca la casilla para confirmarlo.</Text>}
            />
            <Button fullWidth size="md" color="grape" loading={cargando} onClick={enviar} leftSection={<IconTruckDelivery size={18} />}>Entregar mercancía al chofer</Button>
        </Stack>
    );
}
