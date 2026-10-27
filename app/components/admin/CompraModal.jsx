'use client';

import React, { useState, useEffect, useMemo, useDeferredValue, memo } from 'react';
import { 
    Modal, Button, Group, Title, TextInput, NumberInput, 
    Select, Paper, Stack, Grid, Table, ActionIcon,
    Text, Divider, Badge, Checkbox, Box, ScrollArea, Alert, SegmentedControl, ThemeIcon, Popover, FileButton
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
    IconTrash, IconPlus, IconMinus, IconCheck, IconShieldCheck, IconAlertTriangle, IconReceiptTax, IconPackage, IconSparkles, IconExternalLink
} from '@tabler/icons-react';
import imageCompression from 'browser-image-compression';
import { RevisionRenglonesIA, CuadreFactura, prepararRenglones, normRif, r2, URL_SENIAT_RIF } from './LecturaFacturaIA';
import { notifications } from '@mantine/notifications';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
import PrecioVisual from '../ui/PrecioVisual';
import { useAuth } from '@/hooks/useAuth';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { fechaCaracas } from '@/app/constants/hora';
import { OPCIONES_PAGO_PROVEEDOR } from '@/app/constants/metodosPago';
import { PreguntarNumero, useNumeracion } from '@/app/superuser/_components/NumeracionFiscal';

const MAX_LISTA = 60; // renderizar el catálogo completo (600+ productos) en cada cambio del formulario era lo que volvía lenta la pantalla

const FilaProducto = memo(function FilaProducto({ prod, isMobile, onAgregar }) {
    return (
        <Paper p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }} onClick={() => onAgregar(prod)}>
            <Group justify="space-between" wrap="nowrap">
                <Box style={{ minWidth: 0, flex: 1 }}>
                    <Text fw={600} size={isMobile ? 'sm' : 'md'} lineClamp={isMobile ? 2 : 1}>{prod.nombre}</Text>
                    {prod.marca?.nombre && <Text size={isMobile ? 'xs' : 'sm'} fw={700} c="grape.7">Marca: {prod.marca.nombre}</Text>}
                    <Text size={isMobile ? 'xs' : 'sm'} c="dimmed">SKU: {prod.codigo} | Stock: {prod.stockAlmacen}</Text>
                </Box>
                {prod.costoUsd !== undefined && (
                    <Badge color="blue" size={isMobile ? 'md' : 'lg'} variant="light" tt="none" style={{ flexShrink: 0 }}>
                        {isMobile ? '' : 'Costo: '}<PrecioVisual valor={prod.costoUsd} simbolo="$" size="sm" />
                    </Badge>
                )}
            </Group>
        </Paper>
    );
});

// Auditoría del empaque del producto: se corrige aquí lo que el proveedor trae realmente y se guarda en la ficha al registrar la compra
const empaqueCambio = (item) => (Number(item.undPorCaja) || 0) !== (item.empaqueOriginal?.undPorCaja || 0) || (Number(item.cajasPorBulto) || 0) !== (item.empaqueOriginal?.cajasPorBulto || 0) || (Number(item.undPorBulto) || 0) !== (item.empaqueOriginal?.undPorBulto || 0);

function EditorEmpaque({ item, onCambiar }) {
    const modificado = empaqueCambio(item);
    const original = item.empaqueOriginal || {};
    return (
        <Popover width={300} position="bottom-start" shadow="md" withArrow trapFocus>
            <Popover.Target>
                <Button size="compact-xs" variant={modificado ? 'filled' : 'subtle'} color={modificado ? 'orange' : 'gray'} tt="none" leftSection={<IconPackage size={14} />}>
                    {modificado ? 'Empaque modificado' : 'Auditar empaque'}
                </Button>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="xs">
                    <Text size="sm" fw={700}>Empaque de {item.nombre}</Text>
                    <NumberInput size="sm" label="Unidades por caja" description={original.undPorCaja ? `En la ficha: ${original.undPorCaja}` : 'En la ficha: sin caja'} min={0} allowDecimal={false} allowNegative={false} hideControls selectAllOnFocus
                        value={item.undPorCaja || ''} onChange={(v) => onCambiar('undPorCaja', v)} />
                    {item.undPorCaja ? (
                        <NumberInput size="sm" label="Cajas por bulto" description={original.cajasPorBulto ? `En la ficha: ${original.cajasPorBulto}` : 'En la ficha: sin bulto'} min={0} allowDecimal={false} allowNegative={false} hideControls selectAllOnFocus
                            value={item.cajasPorBulto || ''} onChange={(v) => onCambiar('cajasPorBulto', v)} />
                    ) : (
                        <NumberInput size="sm" label="Unidades por bulto" description={`Producto sin caja: el bulto trae las unidades sueltas. En la ficha: ${original.undPorBulto > 1 ? original.undPorBulto : 'sin bulto'}`} min={0} allowDecimal={false} allowNegative={false} hideControls selectAllOnFocus
                            value={item.undPorBulto || ''} onChange={(v) => onCambiar('undPorBulto', v)} />
                    )}
                    <Text size="xs" c="dimmed">
                        {item.undPorCaja ? `1 caja = ${item.undPorCaja} und` : 'Sin caja'}{item.undPorBulto > 1 ? ` · 1 bulto = ${item.undPorBulto.toLocaleString('es-VE')} und` : ''}
                    </Text>
                    {modificado && <Alert color="orange" variant="light" p="xs"><Text size="xs">Al registrar la compra se guardará este empaque en la ficha del producto.</Text></Alert>}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
}

export default function CompraModal({ opened, onClose, tasaBcv = 1, iniciarComoGasto = false }) {
    const { userId, esVendedor } = useAuth();
    const queryClient = useQueryClient();
    const isMobile = useMediaQuery('(max-width: 768px)');
    
    const [carritoCompra, setCarritoCompra] = useState([]);
    const [busquedaProd, setBusquedaProd] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [modoNuevoProveedor, setModoNuevoProveedor] = useState(false);

    // Gasto (servicio, flete, alquiler...): documento de compra sin productos; no toca el inventario y, si es factura, entra al libro de compras
    const [esGasto, setEsGasto] = useState(iniciarComoGasto);
    const [gasto, setGasto] = useState({ descripcion: '', categoriaId: null, base: 0, exento: 0 });
    useEffect(() => { if (opened) setEsGasto(iniciarComoGasto); }, [opened, iniciarComoGasto]);

    // Lectura de la factura con IA: lo impreso (para el cuadre al céntimo), avisos y la ventana de revisión de renglones
    const [analizando, setAnalizando] = useState(false);
    const [lectura, setLectura] = useState(null); // { impreso, avisos, renglones, proveedorNombre, simbolo }
    const [revision, setRevision] = useState(null); // renglones preparados para revisar (null = ventana cerrada)
    const [ivaAjustado, setIvaAjustado] = useState(null); // IVA tal como viene impreso, si difiere por céntimos del calculado

    // Estados para la Fase de Simulación y Prompt de Aceptación
    const [modalSimulacionAbierto, setModalSimulacionAbierto] = useState(false);
    const [datosSimulacion, setDatosSimulacion] = useState(null);
    const [promptTexto, setPromptTexto] = useState('');

    const fetchSelect = async (url) => {
        const res = await fetch(url);
        if (!res.ok) return [];
        return res.json();
    };

    const { data: productos } = useQuery({ queryKey: ['productos-compra'], staleTime: 60_000, queryFn: () => fetchSelect('/api/productos') });
    const { data: proveedores } = useQuery({ queryKey: ['proveedores-compra'], queryFn: () => fetchSelect('/api/proveedores') });
    const { data: categoriasGasto } = useQuery({ queryKey: ['categorias-gasto'], enabled: opened && esGasto, queryFn: async () => (await fetchSelect('/api/finanzas/categorias')).filter?.((c) => c.tipo === 'GASTO' && c.nombre !== 'Compras de Mercancía') || [] });
    const { data: numeracion } = useNumeracion(opened); // el comprobante de retención sigue su propio correlativo

    const formCompra = useForm({
        initialValues: {
            proveedorId: null,
            tipoDocumento: 'FACTURA',
            numeroDocumento: '',
            fechaFactura: fechaCaracas(),
            condicionPago: 'Contado',
            diasCredito: 0,
            moneda: 'USD',
            metodoPago: 'Transferencia',
            referencia: '',
            // Cuándo se retiene el IVA: 'ahora' (el comprobante sale al registrar), 'despues' (queda «Falta retener» y se hace al pagar) o 'no'
            retencionModo: CONFIG_FISCAL.agenteRetencionIva ? 'ahora' : 'no',
            porcentajeRetencion: CONFIG_FISCAL.porcentajeRetencionCompras,
            numeroControl: ''
        }
    });

    // Moneda de la factura: el costo del producto SIEMPRE se guarda en dólares; si la factura llega en bolívares se convierte con la tasa BCV del día
    // Tasa de esta factura: la BCV de hoy, salvo que la factura traiga la suya impresa (la IA la propone) o la persona la escriba.
    // Con ella se pasan los bolívares a dólares para el costo y queda guardada en la compra (el libro convierte con la tasa del documento).
    const [tasaFactura, setTasaFactura] = useState(null);
    const tasa = Number(tasaFactura) > 0 ? Number(tasaFactura) : (Number(tasaBcv) || 0);
    const esBs = formCompra.values.moneda === 'BS';
    const aMon = (usd) => (esBs ? (Number(usd) || 0) * tasa : Number(usd) || 0);

    const formNuevoProv = useForm({
        initialValues: {
            identificacion: '',
            nombre: '',
            telefono: '',
            email: '',
            direccion: '',
            esContribuyenteEspecial: false,
            retencionIvaPorDefecto: 75,
            notas: ''
        }
    });

    const [modalCrearProv, setModalCrearProv] = useState(false);

    // La retención de IVA la practica la EMPRESA (agente de retención) sobre toda factura con IVA, sea cual sea el proveedor;
    // el porcentaje sale de la ficha del proveedor (75 % por defecto). Se puede dejar para el pago o no retener en una compra puntual.
    useEffect(() => {
        formCompra.setFieldValue('retencionModo', CONFIG_FISCAL.agenteRetencionIva ? 'ahora' : 'no');
        const prov = proveedores?.find(p => String(p.id) === String(formCompra.values.proveedorId));
        formCompra.setFieldValue('porcentajeRetencion', Number(prov?.retencionIvaPorDefecto) || CONFIG_FISCAL.porcentajeRetencionCompras);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formCompra.values.proveedorId, proveedores]);

    // ---- Compra por BULTO, por CAJAS o por UNIDADES ----
    // El costo del producto es POR UNIDAD y el stock está en unidades. Lo que se recibe (un bulto, N cajas
    // o N unidades) y su precio (editable, por si el proveedor lo actualizó) se convierten aquí a
    // `cantidad` (unidades) y `precioCompraUnitario` (por unidad), que es lo que espera el servidor.
    const factorDe = (item) => (item.unidadCompra === 'bulto' ? item.undPorBulto : item.unidadCompra === 'caja' ? item.undPorCaja : 1) || 1;
    const recalcular = (item) => {
        const f = factorDe(item);
        return { ...item, cantidad: (Number(item.cantidadCompra) || 0) * f, precioCompraUnitario: (Number(item.precioCompra) || 0) / f };
    };

    // Un vendedor registra la compra pero no ve costos ni cambia precios: el servidor le devuelve la simulación sin esos datos
    const soloRegistro = Boolean(datosSimulacion?.[0]?.soloRegistro);

    // Monto de un renglón como lo imprime el proveedor: precio de lo que se compra (unidad, caja o bulto) × cantidad, a céntimos
    const montoLinea = (item) => r2((Number(item.precioCompra) || 0) * (Number(item.cantidadCompra) || 0));

    // El IVA ajustado al impreso deja de valer si cambian los renglones o el tipo de documento
    useEffect(() => { setIvaAjustado(null); }, [carritoCompra, formCompra.values.tipoDocumento]);

    // Renglón nuevo de la compra a partir de la ficha del producto (por unidad, al costo actual)
    const nuevoItem = (prod) => {
        const costoUnidad = Number(prod.costoUsd) || 0;
        return {
            id: prod.id,
            codigo: prod.codigo,
            nombre: prod.nombre,
            marca: prod.marca?.nombre || '',
            costoAnterior: costoUnidad,
            undPorCaja: Number(prod.unidadesPorCaja) || 0,
            undPorBulto: Number(prod.unidadesPorBulto) || 0,
            cajasPorBulto: Number(prod.cajasPorBulto) || 0,
            empaqueOriginal: { undPorCaja: Number(prod.unidadesPorCaja) || 0, cajasPorBulto: Number(prod.cajasPorBulto) || 0, undPorBulto: Number(prod.unidadesPorBulto) || 0 },
            unidadCompra: 'unidad',
            cantidadCompra: 1,
            precioCompra: Number(aMon(costoUnidad).toFixed(4)),
            porcentajeIva: prod.porcentajeIva === null || prod.porcentajeIva === undefined || prod.porcentajeIva === "" || Number.isNaN(Number(prod.porcentajeIva)) ? 16 : Number(prod.porcentajeIva), // 0 = exento: no se puede tratar como "sin dato"
            aceptarCambioPrecio: true
        };
    };

    // ---- Factura leída con IA ----
    // Pasa a la compra los renglones que la persona confirmó en la revisión: producto elegido, presentación (unidad, caja o bulto)
    // con sus unidades (si difieren de la ficha quedan como "empaque modificado" y se guardan en la ficha al registrar) y el precio
    // tal como viene en la factura. Cada renglón lleva su clave del proveedor para recordarlo en la próxima factura.
    const agregarDesdeFactura = (filas) => {
        const avisos = [];
        let carrito = [...carritoCompra];
        for (const f of filas) {
            const prod = productos?.find((p) => Number(p.id) === Number(f.productoId));
            if (!prod) continue;
            let it = nuevoItem(prod);
            const n = Number(f.contenido) || 0;
            const cajasLeidas = Number(f.linea.cajasPorBulto) || 0;
            if (f.unidadCompra === 'caja' && n > 1) {
                it.undPorCaja = n;
                if (it.cajasPorBulto) it.undPorBulto = it.cajasPorBulto * n;
            } else if (f.unidadCompra === 'bulto' && n > 1) {
                if (cajasLeidas > 1 && n % cajasLeidas === 0) { it.cajasPorBulto = cajasLeidas; it.undPorCaja = n / cajasLeidas; it.undPorBulto = n; }
                else if (it.undPorCaja > 0 && n % it.undPorCaja === 0) { it.cajasPorBulto = n / it.undPorCaja; it.undPorBulto = n; }
                else if (it.undPorCaja > 0) { it = { ...it, _bultoSinCuadrar: n }; } // la caja de la ficha no divide al bulto: se pasa a unidades
                else { it.cajasPorBulto = 0; it.undPorBulto = n; } // producto sin caja: el bulto trae las unidades sueltas
            }
            let unidad = f.unidadCompra === 'caja' && it.undPorCaja > 0 ? 'caja' : f.unidadCompra === 'bulto' && it.undPorBulto > 1 && !it._bultoSinCuadrar ? 'bulto' : 'unidad';
            let cantidad = Number(f.linea.cantidad) || 1;
            let precio = Number(f.linea.precioUnitario) || 0;
            // Si la presentación no se pudo aplicar pero se sabe cuántas unidades trae, se convierte a unidades sin cambiar el monto del renglón
            const factorPedido = unidad === 'unidad' && f.unidadCompra !== 'unidad' && n > 1 ? n : 1;
            if (factorPedido > 1) { cantidad *= factorPedido; precio /= factorPedido; avisos.push(`«${prod.nombre}»: se pasó a unidades (${n} por ${f.unidadCompra}) porque no cuadra con el empaque de la ficha.`); }
            if (!Number.isInteger(cantidad)) { avisos.push(`«${prod.nombre}»: la cantidad ${cantidad} no es entera; se redondeó.`); cantidad = Math.max(1, Math.round(cantidad)); }
            delete it._bultoSinCuadrar;
            it = recalcular({ ...it, unidadCompra: unidad, cantidadCompra: cantidad, precioCompra: Number(precio.toFixed(6)), claveProveedor: f.clave, descripcionProveedor: f.linea.descripcion });

            const previo = carrito.find((i) => i.id === it.id);
            if (previo) {
                // El mismo producto en dos renglones: se juntan en unidades con el precio promedio (el monto no cambia)
                const unidades = previo.cantidad + it.cantidad;
                const monto = previo.precioCompraUnitario * previo.cantidad + it.precioCompraUnitario * it.cantidad;
                carrito = carrito.map((i) => (i.id === it.id ? recalcular({ ...previo, unidadCompra: 'unidad', cantidadCompra: unidades, precioCompra: Number((monto / unidades).toFixed(6)) }) : i));
                avisos.push(`«${prod.nombre}» venía en más de un renglón: se juntó en ${unidades} unidades.`);
            } else {
                carrito.push(it);
            }
        }
        setCarritoCompra(carrito);
        setRevision(null);
        if (avisos.length) setLectura((l) => (l ? { ...l, avisos: [...l.avisos, ...avisos] } : l));
        notifications.show({ color: 'teal', title: 'Renglones pasados a la compra', message: 'Revisa cantidades, precios y el cuadre con la factura antes de registrar.' });
    };

    // Lee la foto o el PDF con IA y PROPONE: cabecera (proveedor por RIF, número, control, fecha, moneda) y renglones para revisar.
    // Si el proveedor no está registrado se abre su ficha ya llenada, con acceso a la consulta de RIF del SENIAT para ver si se le retiene 75 % o 100 %.
    const leerFactura = async (file) => {
        if (!file) return;
        setAnalizando(true);
        const id = 'ocr-factura';
        notifications.show({ id, title: 'Leyendo la factura con IA…', message: 'Número, proveedor, renglones, IVA y totales. Puede tardar unos segundos.', loading: true, autoClose: false });
        try {
            // El servidor no acepta archivos de más de ~4,5 MB: la foto del teléfono se comprime aquí (sigue legible para la IA)
            let archivo = file;
            if (file.type.startsWith('image/') && file.size > 1.5 * 1024 * 1024) {
                archivo = await imageCompression(file, { maxSizeMB: 1.5, maxWidthOrHeight: 2400, useWebWorker: true });
            }
            if (archivo.size > 4 * 1024 * 1024) throw new Error('El archivo pesa más de 4 MB. Si es un PDF, envía solo la página de la factura o una foto.');
            const fd = new FormData();
            fd.append('file', archivo, file.name || 'factura');
            const res = await fetch('/api/ocr/factura', { method: 'POST', body: fd });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || 'No se pudo leer la factura');
            const avisos = [];

            // Cabecera (en modo gasto se lee igual; en vez de renglones de inventario se llenan la descripción y los montos del gasto)
            const comoGasto = esGasto;
            formCompra.setFieldValue('tipoDocumento', d.tipoDocumento === 'NOTA_ENTREGA' ? 'NOTA_ENTREGA' : 'FACTURA');
            if (d.numeroFactura) formCompra.setFieldValue('numeroDocumento', String(d.numeroFactura).slice(0, 50));
            if (d.numeroControl && d.tipoDocumento !== 'NOTA_ENTREGA') formCompra.setFieldValue('numeroControl', String(d.numeroControl).slice(0, 30));
            if (d.fechaEmision) {
                if (d.fechaEmision <= fechaCaracas()) formCompra.setFieldValue('fechaFactura', d.fechaEmision);
                else avisos.push(`La fecha leída (${d.fechaEmision.split('-').reverse().join('/')}) es posterior a hoy: revisa la fecha de la factura.`);
            }
            const monedaLeida = d.moneda === 'USD' ? 'USD' : 'BS';
            if (monedaLeida !== formCompra.values.moneda) {
                if (monedaLeida === 'BS' && !(tasa > 0 || Number(d.tasaBcv) > 0)) avisos.push('La factura está en bolívares pero no hay tasa BCV vigente: no se puede registrar en Bs todavía.');
                else if (carritoCompra.length) cambiarMoneda(monedaLeida);
                else formCompra.setFieldValue('moneda', monedaLeida);
            }
            // La factura trae su propia tasa: se propone para esta compra (el proveedor fijó sus dólares con ella). Se ve y se cambia arriba.
            if (Number(d.tasaBcv) > 0) {
                const tasaHoy = Number(tasaBcv) || 0;
                setTasaFactura(Number(d.tasaBcv));
                if (Math.abs(Number(d.tasaBcv) - tasaHoy) > 0.005) avisos.push(`Se usa la tasa impresa en la factura (${d.tasaBcv}) para pasar los precios a dólares${tasaHoy ? `; la BCV de hoy es ${tasaHoy}` : ''}. Puedes cambiarla en "Tasa de la factura".`);
            }

            // Proveedor por RIF
            const rif = normRif(d.proveedorRif);
            const prov = rif ? (proveedores || []).find((p) => normRif(p.identificacion) === rif) : null;
            let proveedorId = formCompra.values.proveedorId;
            if (prov) {
                if (proveedorId && String(proveedorId) !== String(prov.id)) avisos.push(`El RIF de la factura (${d.proveedorRif}) es de ${prov.nombre}, no del proveedor elegido: lo cambié.`);
                proveedorId = String(prov.id);
                formCompra.setFieldValue('proveedorId', proveedorId);
                setModoNuevoProveedor(false);
            } else if (d.proveedorNombre || d.proveedorRif) {
                proveedorId = null;
                formCompra.setFieldValue('proveedorId', null);
                formNuevoProv.setValues({
                    identificacion: d.proveedorRif || '', nombre: d.proveedorNombre || '', telefono: d.proveedorTelefono || '', email: d.proveedorEmail || '',
                    direccion: d.proveedorDireccion || '', esContribuyenteEspecial: false, retencionIvaPorDefecto: 75, notas: '',
                });
                setModalCrearProv(true);
                avisos.push(`El proveedor ${d.proveedorNombre || ''}${d.proveedorRif ? ` (${d.proveedorRif})` : ''} no está registrado: revisa sus datos, consulta su RIF en el SENIAT y guárdalo.`);
            }

            const impreso = { baseImponible: d.baseImponible, montoExento: d.montoExento, montoIva: d.montoIva, total: d.total, totalUsd: d.totalUsd };
            const simbolo = monedaLeida === 'BS' ? 'Bs' : '$';

            // Gasto (servicio, almuerzo, equipo...): la descripción sale de los renglones y la categoría, del último gasto de este proveedor
            if (comoGasto) {
                const lineas = d.lineas || [];
                const sumar = (exento) => r2(lineas.filter((l) => Boolean(l.exento) === exento).reduce((a, l) => a + (Number(l.totalLinea) || r2((l.precioUnitario || 0) * (l.cantidad || 0))), 0));
                let anterior = null;
                if (proveedorId) {
                    try { anterior = await (await fetch(`/api/compras/equivalencias?proveedorId=${proveedorId}&gasto=1`)).json(); } catch { anterior = null; }
                }
                setGasto((g) => ({
                    descripcion: lineas.map((l) => l.descripcion).join(', ').slice(0, 200) || anterior?.descripcionGasto || g.descripcion,
                    categoriaId: anterior?.categoriaGastoId ? String(anterior.categoriaGastoId) : g.categoriaId,
                    base: d.baseImponible ?? sumar(false),
                    exento: d.montoExento ?? sumar(true),
                }));
                if (anterior?.categoriaGastoId) avisos.push(`Categoría propuesta: la del último gasto de este proveedor («${anterior.descripcionGasto}»). Cámbiala si este es otro tipo de gasto.`);
                setLectura({ impreso, avisos, renglones: 0, proveedorNombre: prov?.nombre || d.proveedorNombre || '', simbolo, lineas: [], equivalencias: [] });
                notifications.update({ id, title: 'Factura leída', message: 'Revisa la descripción, la categoría y los montos del gasto.', color: 'teal', loading: false, autoClose: 5000 });
                return;
            }

            // Renglones: se proponen con lo aprendido de este proveedor (si ya lo conocemos) y candidatos por parecido
            let equivalencias = [];
            if (proveedorId) {
                try { equivalencias = await (await fetch(`/api/compras/equivalencias?proveedorId=${proveedorId}`)).json(); } catch { equivalencias = []; }
            }
            const renglones = prepararRenglones(d.lineas || [], productos || [], Array.isArray(equivalencias) ? equivalencias : []);
            setLectura({
                impreso,
                avisos, renglones: renglones.length, proveedorNombre: prov?.nombre || d.proveedorNombre || '', simbolo,
                lineas: d.lineas || [], equivalencias: Array.isArray(equivalencias) ? equivalencias : [],
            });
            setIvaAjustado(null);
            if (renglones.length) setRevision(renglones);
            else avisos.push('No se leyeron renglones: agrégalos a mano.');
            const aprendidos = renglones.filter((r) => r.origen === 'aprendido').length;
            notifications.update({ id, title: 'Factura leída', message: `${renglones.length} renglón(es)${aprendidos ? `, ${aprendidos} ya enlazados con este proveedor` : ''}. Revisa y elige los productos.`, color: 'teal', loading: false, autoClose: 5000 });
        } catch (e) {
            notifications.update({ id, title: 'No se pudo leer la factura', message: `${e.message} Puedes llenarla a mano.`, color: 'red', loading: false, autoClose: 15000 });
        } finally {
            setAnalizando(false);
        }
    };

    const agregarAlCarritoCompra = (prod) => {
        const existe = carritoCompra.find(i => i.id === prod.id);
        if (existe) {
            setCarritoCompra(carritoCompra.map(i => i.id === prod.id ? recalcular({ ...i, cantidadCompra: i.cantidadCompra + 1 }) : i));
        } else {
            setCarritoCompra([...carritoCompra, recalcular(nuevoItem(prod))]);
        }
    };

    const cambiarCantidad = (id, delta) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id === id) {
                const nuevaCant = (Number(i.cantidadCompra) || 0) + delta;
                return nuevaCant > 0 ? recalcular({ ...i, cantidadCompra: nuevaCant }) : null;
            }
            return i;
        }).filter(Boolean));
    };

    const actualizarCantidadCompra = (id, valor) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? recalcular({ ...i, cantidadCompra: valor === '' ? '' : Number(valor) || 0 }) : i));
    };

    // Al salir del campo, una cantidad vacía o 0 vuelve a 1
    const confirmarCantidadCompra = (id) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id && !(Number(i.cantidadCompra) >= 1) ? recalcular({ ...i, cantidadCompra: 1 }) : i));
    };

    // Al cambiar de unidad se conserva el costo por unidad y se recalcula el precio del bulto / la caja
    const cambiarUnidadCompra = (id, unidad) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id !== id) return i;
            const nuevo = { ...i, unidadCompra: unidad, cantidadCompra: 1 };
            return recalcular({ ...nuevo, precioCompra: i.precioCompraUnitario * factorDe(nuevo) });
        }));
    };

    // Corrige cuántas unidades trae la caja y cuántas cajas el bulto (el total del bulto se calcula, igual que en la ficha)
    const cambiarEmpaque = (id, campo, valor) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id !== id) return i;
            const v = Math.max(0, Math.floor(Number(valor)) || 0);
            const n = { ...i, [campo]: v };
            if (campo === 'undPorCaja' && v && !i.undPorCaja && !i.cajasPorBulto && i.undPorBulto > 1 && i.undPorBulto % v === 0) n.cajasPorBulto = i.undPorBulto / v; // el bulto ya existía: se reparte en cajas
            if (!n.undPorCaja) n.cajasPorBulto = 0;
            if (n.undPorCaja) n.undPorBulto = n.cajasPorBulto ? n.cajasPorBulto * n.undPorCaja : 0; // sin caja el total del bulto se escribe directo
            // si la presentación elegida deja de existir, se vuelve a unidades conservando el costo por unidad
            if ((n.unidadCompra === 'caja' && !n.undPorCaja) || (n.unidadCompra === 'bulto' && !(n.undPorBulto > 1))) {
                return recalcular({ ...n, unidadCompra: 'unidad', cantidadCompra: 1, precioCompra: i.precioCompraUnitario });
            }
            return recalcular(n);
        }));
    };

    // Al cambiar la moneda de la factura se reconvierten los precios ya escritos y el monto del gasto
    const cambiarMoneda = (nueva) => {
        if (!nueva || nueva === formCompra.values.moneda) return;
        if (nueva === 'BS' && !(tasa > 0)) return notifications.show({ title: 'Sin tasa BCV', message: 'No hay una tasa BCV vigente para convertir a bolívares.', color: 'red' });
        const k = nueva === 'BS' ? tasa : 1 / tasa;
        setCarritoCompra(carritoCompra.map(i => recalcular({ ...i, precioCompra: Number(((Number(i.precioCompra) || 0) * k).toFixed(4)) })));
        setGasto({ ...gasto, base: Number(((Number(gasto.base) || 0) * k).toFixed(2)), exento: Number(((Number(gasto.exento) || 0) * k).toFixed(2)) });
        formCompra.setFieldValue('moneda', nueva);
    };

    // Se guarda lo que escribe la persona tal cual ("12." o "12.5"): convertirlo a número al teclear se comía el punto decimal
    const actualizarPrecioCompra = (id, nuevoPrecio) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? recalcular({ ...i, precioCompra: nuevoPrecio }) : i));
    };

    const toggleAceptarCambioItem = (id) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? { ...i, aceptarCambioPrecio: !i.aceptarCambioPrecio } : i));
    };

    const eliminarItem = (id) => setCarritoCompra(carritoCompra.filter(i => i.id !== id));

    const esFactura = formCompra.values.tipoDocumento === 'FACTURA';
    // Misma regla que imprime el proveedor (y que usan las ventas): cada renglón = precio × cantidad redondeado a céntimos,
    // y el IVA se calcula UNA vez sobre la base de cada alícuota. Antes se sumaban renglones sin redondear y el IVA renglón por
    // renglón, y la base o el IVA podían quedar un céntimo distintos de la factura en papel (y del libro de compras).
    let subtotal = 0;
    let montoIva = 0;
    let montoExento = 0; // lo que no lleva IVA: va como exento en el libro de compras
    const basesPorAlicuota = new Map();

    carritoCompra.forEach(item => {
        const itemSub = montoLinea(item);
        subtotal += itemSub;
        if (esFactura && item.porcentajeIva > 0) {
            basesPorAlicuota.set(item.porcentajeIva, (basesPorAlicuota.get(item.porcentajeIva) || 0) + itemSub);
        } else {
            montoExento += itemSub;
        }
    });
    subtotal = r2(subtotal);
    montoExento = r2(montoExento);
    montoIva = r2([...basesPorAlicuota.entries()].reduce((a, [pct, base]) => a + r2(r2(base) * pct / 100), 0));
    const montoIvaCalculado = montoIva;
    // El IVA impreso en la factura, si la persona eligió usarlo (solo difiere por céntimos de redondeo del proveedor)
    if (!esGasto && esFactura && ivaAjustado !== null) montoIva = r2(ivaAjustado);

    if (esGasto) {
        const base = Math.max(0, Number(gasto.base) || 0);
        const exento = Math.max(0, Number(gasto.exento) || 0);
        subtotal = base + exento;
        montoExento = esFactura ? exento : 0;
        montoIva = esFactura ? Math.round(base * CONFIG_FISCAL.alicuotaGeneral) / 100 : 0;
    }

    let montoRetencion = 0;
    // De contado se paga ya: la retención no puede quedar para el pago
    const retencionModo = formCompra.values.condicionPago === 'Contado' && formCompra.values.retencionModo === 'despues' ? 'ahora' : formCompra.values.retencionModo;
    if (retencionModo === 'ahora' && esFactura && montoIva > 0) {
        montoRetencion = r2(montoIva * (formCompra.values.porcentajeRetencion / 100));
    }

    const totalFinal = r2(subtotal + montoIva);

    // Comprobante de retención: si todavía no se dijo con qué número empieza la numeración, se pregunta antes de registrar
    const serieRet = numeracion?.series?.find((s) => s.clave === 'RET-COMPRA');
    const faltaNumeracionRet = montoRetencion > 0 && Boolean(serieRet) && !serieRet.configurado;
    const periodoRet = String(formCompra.values.fechaFactura || fechaCaracas()).slice(0, 7).replace('-', '');

    const handleLanzarSimulacion = async () => {
        if (carritoCompra.length === 0) return notifications.show({ message: 'El carrito de compra está vacío', color: 'orange' });
        if (!formCompra.values.numeroDocumento) return notifications.show({ message: 'Indica el número de factura o recibo', color: 'red' });
        if (!formCompra.values.proveedorId && !modoNuevoProveedor) return notifications.show({ message: 'Selecciona o crea un proveedor', color: 'red' });
        if (formCompra.values.condicionPago === 'Credito' && !(Number(formCompra.values.diasCredito) >= 1)) return notifications.show({ message: 'Indica los días de crédito (si no, la cuenta por pagar nace vencida)', color: 'red' });

        setIsSubmitting(true);
        try {
            const payload = {
                simular: true,
                proveedorId: modoNuevoProveedor ? null : Number(formCompra.values.proveedorId),
                nuevoProveedor: modoNuevoProveedor ? formNuevoProv.values : null,
                tipoDocumento: formCompra.values.tipoDocumento,
                numeroDocumento: formCompra.values.numeroDocumento,
                fechaFactura: formCompra.values.fechaFactura,
                condicionPago: formCompra.values.condicionPago,
                diasCredito: formCompra.values.diasCredito,
                moneda: formCompra.values.moneda,
                tasaCambio: tasa,
                subtotal, montoIva, montoRetencion, totalFinal,
                numeroControl: esFactura ? formCompra.values.numeroControl : null, montoExento: esFactura ? montoExento : 0, porcentajeRetencion: formCompra.values.porcentajeRetencion, aplicarRetencion: retencionModo === 'ahora', retencionModo,
                detalles: carritoCompra
            };

            const res = await fetch('/api/compras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al simular la compra');

            setDatosSimulacion(data.detallesSimulacion);
            setPromptTexto(data.mensajePrompt);
            setModalSimulacionAbierto(true);

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // El gasto no pasa por la auditoría de costos (no hay productos): se valida y se registra directo
    const handleRegistrarGasto = () => {
        if (!formCompra.values.numeroDocumento) return notifications.show({ message: 'Indica el número de factura o recibo', color: 'red' });
        if (!formCompra.values.proveedorId && !modoNuevoProveedor) return notifications.show({ message: 'Selecciona o crea un proveedor', color: 'red' });
        if (String(gasto.descripcion).trim().length < 3) return notifications.show({ message: 'Describe en qué fue el gasto', color: 'red' });
        if (!gasto.categoriaId) return notifications.show({ message: 'Elige la categoría del gasto', color: 'red' });
        if (formCompra.values.condicionPago === 'Credito' && !(Number(formCompra.values.diasCredito) >= 1)) return notifications.show({ message: 'Indica los días de crédito (si no, la cuenta por pagar nace vencida)', color: 'red' });
        if (!(subtotal > 0)) return notifications.show({ message: 'Indica el monto del gasto', color: 'red' });
        return handleEjecutarCompraFinal();
    };

    const handleEjecutarCompraFinal = async () => {
        setIsSubmitting(true);
        try {
            // Primero se guarda el empaque corregido en la ficha: si falla, no se registra la compra con unidades dudosas.
            // Un vendedor no edita fichas: su compra usa el empaque indicado para contar las unidades, pero la ficha queda igual.
            if (!esGasto && !esVendedor) {
                for (const item of carritoCompra.filter(empaqueCambio)) {
                    const r = await fetch(`/api/productos/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.undPorCaja ? { unidadesPorCaja: item.undPorCaja, cajasPorBulto: item.cajasPorBulto || null } : { unidadesPorCaja: null, cajasPorBulto: null, unidadesPorBulto: item.undPorBulto > 1 ? item.undPorBulto : null }) });
                    if (!r.ok) throw new Error(`No se pudo guardar el empaque de ${item.nombre}: ${(await r.json().catch(() => null))?.error || 'error del servidor'}`);
                }
            }
            const payload = {
                simular: false,
                proveedorId: modoNuevoProveedor ? null : Number(formCompra.values.proveedorId),
                nuevoProveedor: modoNuevoProveedor ? formNuevoProv.values : null,
                tipoDocumento: formCompra.values.tipoDocumento,
                numeroDocumento: formCompra.values.numeroDocumento,
                fechaFactura: formCompra.values.fechaFactura,
                condicionPago: formCompra.values.condicionPago,
                diasCredito: formCompra.values.diasCredito,
                moneda: formCompra.values.moneda,
                tasaCambio: tasa,
                metodoPago: formCompra.values.metodoPago,
                referencia: formCompra.values.referencia,
                subtotal, montoIva, montoRetencion, totalFinal,
                numeroControl: esFactura ? formCompra.values.numeroControl : null, montoExento: esFactura ? montoExento : 0, porcentajeRetencion: formCompra.values.porcentajeRetencion, aplicarRetencion: retencionModo === 'ahora', retencionModo,
                registradoPorId: userId,
                esGasto, descripcionGasto: esGasto ? gasto.descripcion : null, categoriaGastoId: esGasto ? Number(gasto.categoriaId) : null,
                detalles: esGasto ? [] : carritoCompra
            };

            const res = await fetch('/api/compras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.codigo) queryClient.invalidateQueries({ queryKey: ['numeracion'] }); // falta configurar la numeración de retenciones
                throw new Error(data.error || 'Error al registrar la compra');
            }

            notifications.show({ title: 'Éxito', message: `${esGasto ? 'Gasto registrado (no afecta el inventario).' : 'Factura registrada, inventario y costos actualizados.'}${data.comprobanteRetencion ? ` Comprobante de retención de IVA: ${data.comprobanteRetencion}` : ''}`, color: 'green', autoClose: 9000 });
            queryClient.invalidateQueries({ queryKey: ['productos-compra'] });
            queryClient.invalidateQueries({ queryKey: ['productos-pos'] }); // el POS ve el stock y el costo nuevos
            setCarritoCompra([]);
            setGasto({ descripcion: '', categoriaId: null, base: 0, exento: 0 });
            setModalSimulacionAbierto(false);
            onClose();

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const opcionesProveedores = useMemo(() => proveedores?.map(p => ({ value: String(p.id), label: `${p.nombre} (RIF: ${p.identificacion})` })) || [], [proveedores]);
    const busquedaDiferida = useDeferredValue(busquedaProd);
    const coincidencias = useMemo(() => buscarProductos(productos, busquedaDiferida), [productos, busquedaDiferida]);
    const productosFiltrados = useMemo(() => coincidencias.slice(0, MAX_LISTA), [coincidencias]);
    const hayMas = coincidencias.length > MAX_LISTA;

    const sim = formCompra.values.moneda === 'BS' ? 'Bs' : '$';
    const accionRegistrar = esGasto ? handleRegistrarGasto : handleLanzarSimulacion;
    const registroBloqueado = (esGasto ? !(subtotal > 0) : carritoCompra.length === 0) || faltaNumeracionRet || (esBs && !(tasa > 0));
    const labelBoton = esGasto ? 'Registrar gasto' : 'Analizar compra y costos';

    // ---- Declaración de responsabilidad (una línea en escritorio) ----
    const declaracion = !esGasto && (
        <Alert icon={<IconShieldCheck size={isMobile ? 16 : 18} />} color="red" variant="light" mb={isMobile ? 6 : 0} py={isMobile ? undefined : 6} px="sm" p={isMobile ? 'xs' : undefined}
            title={isMobile ? 'Declaración de Responsabilidad de Recepción' : undefined}
            styles={isMobile ? { title: { fontSize: 12, textTransform: 'none' }, message: { fontSize: 11, lineHeight: 1.3 } } : { icon: { marginRight: 8 } }}>
            {isMobile
                ? 'Al registrar y firmar esta factura, certifica bajo su estricta responsabilidad que la mercancía física ingresada al almacén ha sido contada y validada.'
                : <Text size="xs"><b>Declaración de responsabilidad de recepción:</b> al registrar y firmar esta factura certifica, bajo su estricta responsabilidad, que la mercancía física ingresada al almacén ha sido contada y validada.</Text>}
        </Alert>
    );

    // ---- Aviso del primer comprobante de retención ----
    const avisoRetencion = faltaNumeracionRet && (
        <Paper radius="md" p={isMobile ? 'sm' : 'md'}
            style={{ background: 'linear-gradient(135deg, var(--mantine-color-orange-0), #fff 70%)', border: '1px solid var(--mantine-color-orange-3)', borderLeft: '5px solid var(--mantine-color-orange-6)', flex: '0 0 auto' }}>
            <Group align="flex-start" wrap={isMobile ? 'wrap' : 'nowrap'} gap="md">
                <ThemeIcon size={isMobile ? 34 : 44} radius="xl" color="orange" variant="light" style={{ flex: '0 0 auto' }}><IconReceiptTax size={isMobile ? 20 : 26} /></ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs" mb={2}>
                        <Text fw={800} size={isMobile ? 'sm' : 'md'}>Primer comprobante de retención de IVA</Text>
                        <Badge color="orange" variant="light" size="sm">Una sola vez</Badge>
                    </Group>
                    <Text size="sm" c="dimmed" mb="sm">Esta factura retiene IVA y su comprobante lleva su propio correlativo. Indica con qué número sale el próximo{serieRet.periodo ? <> (empieza por <b>{serieRet.periodo}</b>)</> : null}; luego el sistema lo lleva solo.</Text>
                    <PreguntarNumero serie={serieRet} puedeEditar={numeracion.puedeEditar} enLinea />
                </Box>
            </Group>
        </Paper>
    );

    // ---- Catálogo de productos disponibles ----
    const panelCatalogo = !esGasto && (
        <Paper withBorder p={isMobile ? 'xs' : 'sm'} radius="md" h={isMobile ? 260 : undefined}
            style={{ display: 'flex', flexDirection: 'column', ...(isMobile ? {} : { flex: '0 0 clamp(300px, 28%, 420px)', minHeight: 0 }) }}>
            {!isMobile && <Group justify="space-between" mb={6}><Text fw={700} size="sm">Productos disponibles</Text><Text size="xs" c="dimmed">{coincidencias.length} encontrados</Text></Group>}
            <TextInput size="sm" placeholder="Buscar producto por nombre o SKU..." mb={isMobile ? 6 : 'xs'} value={busquedaProd} onChange={(e) => setBusquedaProd(e.currentTarget.value)} data-autofocus />
            <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
                <Stack gap={6}>
                    {productosFiltrados.map(prod => <FilaProducto key={prod.id} prod={prod} isMobile onAgregar={agregarAlCarritoCompra} />)}
                    {hayMas && <Text size="xs" c="dimmed" ta="center">Mostrando {MAX_LISTA} de {coincidencias.length}: escribe para afinar la búsqueda.</Text>}
                </Stack>
            </ScrollArea>
        </Paper>
    );

    // ---- Datos del documento (proveedor, factura, fecha, moneda, retención) ----
    const datosDocumento = (
        <Box style={{ flex: '0 0 auto' }}>
            <Group justify="space-between" align="center" mb={isMobile ? 6 : 'xs'} wrap={isMobile ? 'wrap' : 'nowrap'} gap="xs">
                <SegmentedControl size="xs" fullWidth={isMobile} style={isMobile ? { flex: '1 1 100%' } : undefined} value={esGasto ? 'gasto' : 'mercancia'} onChange={(v) => setEsGasto(v === 'gasto')}
                    data={[{ value: 'mercancia', label: isMobile ? 'Mercancía' : 'Compra de mercancía (inventario)' }, { value: 'gasto', label: isMobile ? 'Gasto' : 'Gasto (no afecta el inventario)' }]} />
                {/* En el teléfono, "image/*" deja elegir entre la cámara y la galería */}
                <FileButton onChange={leerFactura} accept="image/*,application/pdf" disabled={analizando}>
                    {(props) => (
                        <Button {...props} size="xs" color="grape" variant="light" tt="none" loading={analizando} fullWidth={isMobile} leftSection={<IconSparkles size={16} />}>
                            Leer factura con IA (foto o PDF)
                        </Button>
                    )}
                </FileButton>
            </Group>
            <Grid gutter="xs" align="flex-end">
                <Grid.Col span={{ base: 12, md: 5 }}>
                    <Group gap="xs" wrap="nowrap" align="flex-end">
                        <Select size="sm" style={{ flex: 1, minWidth: 0 }} label="Proveedor" placeholder="Seleccione proveedor..." searchable data={opcionesProveedores} {...formCompra.getInputProps('proveedorId')} />
                        <Button size="sm" variant="light" color="grape" tt="none" style={{ flex: '0 0 auto' }} onClick={() => setModalCrearProv(true)}>+ Nuevo</Button>
                    </Group>
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 3 }}>
                    <Select size="sm" label="Tipo de documento" allowDeselect={false}
                        data={[{ value: 'FACTURA', label: 'Factura (aplica IVA)' }, { value: 'NOTA_ENTREGA', label: 'Nota de entrega' }]}
                        {...formCompra.getInputProps('tipoDocumento')} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <TextInput size="sm" label="Nro. factura / recibo" placeholder="F-98765" withAsterisk {...formCompra.getInputProps('numeroDocumento')} />
                </Grid.Col>
                {esFactura && (
                    <Grid.Col span={{ base: 12, md: 2 }}>
                        <TextInput size="sm" label="Nro. de control" placeholder="00-009497" {...formCompra.getInputProps('numeroControl')} />
                    </Grid.Col>
                )}
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <TextInput size="sm" type="date" label="Fecha de factura" withAsterisk {...formCompra.getInputProps('fechaFactura')} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <Select size="sm" label="Condición de pago" allowDeselect={false} data={[{ value: 'Contado', label: 'Contado' }, { value: 'Credito', label: 'Crédito' }]} {...formCompra.getInputProps('condicionPago')} />
                </Grid.Col>
                {formCompra.values.condicionPago === 'Credito' && (
                    <Grid.Col span={{ base: 6, md: 2 }}>
                        <NumberInput size="sm" label="Días de crédito" min={1} withAsterisk {...formCompra.getInputProps('diasCredito')} />
                    </Grid.Col>
                )}
                {formCompra.values.condicionPago === 'Contado' && (
                    <>
                        <Grid.Col span={{ base: 6, md: 3 }}>
                            <Select size="sm" label="¿Cómo se pagó?" allowDeselect={false} data={OPCIONES_PAGO_PROVEEDOR} {...formCompra.getInputProps('metodoPago')} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 6, md: 2 }}>
                            <TextInput size="sm" label="Referencia" placeholder="Opcional" maxLength={100} {...formCompra.getInputProps('referencia')} />
                        </Grid.Col>
                    </>
                )}
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <Select size="sm" label="Moneda" allowDeselect={false} data={[{ value: 'USD', label: 'USD ($)' }, { value: 'BS', label: 'Bs' }]} {...formCompra.getInputProps('moneda')} onChange={cambiarMoneda} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                    <NumberInput size="sm" label="Tasa de la factura" min={0} decimalScale={4} hideControls
                        value={tasaFactura ?? (Number(tasaBcv) || '')} onChange={(v) => setTasaFactura(Number(v) > 0 ? Number(v) : null)}
                        description={tasaFactura && Math.abs(tasaFactura - (Number(tasaBcv) || 0)) > 0.005
                            ? <Text span size="xs">BCV hoy {tasaBcv} · <Text span size="xs" c="blue" style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setTasaFactura(null)}>usar la de hoy</Text></Text>
                            : 'BCV de hoy, o la que imprima la factura'} />
                </Grid.Col>
                {esFactura && montoIva > 0 && (
                    <Grid.Col span={{ base: 12, md: 'auto' }}>
                        <Group gap="sm" wrap="nowrap" align="flex-end">
                            <Select size="sm" w={170} label="Retención de IVA" allowDeselect={false} value={retencionModo} onChange={(v) => formCompra.setFieldValue('retencionModo', v)}
                                data={[{ value: 'ahora', label: 'Retener ahora' }, { value: 'despues', label: 'Retener al pagar', disabled: formCompra.values.condicionPago === 'Contado' }, { value: 'no', label: 'No retener' }]} />
                            {retencionModo !== 'no' && (
                                <Select size="sm" allowDeselect={false} data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} w={84} {...formCompra.getInputProps('porcentajeRetencion')} />
                            )}
                        </Group>
                    </Grid.Col>
                )}
            </Grid>
            {esBs && (
                <Alert color="blue" variant="light" mt="xs" py={6} px="sm">
                    <Text size="xs">{tasa > 0 ? <>Factura en <b>bolívares</b>. Tasa {tasaFactura ? 'de la factura' : 'BCV de hoy'}: <b>Bs {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</b> por dólar. Escribe los precios tal como vienen en la factura (Bs); el costo del producto se guarda en dólares y aquí ves el costo actual y el de esta factura en ambas monedas.</> : <b>No hay tasa BCV vigente: no se puede registrar una factura en bolívares.</b>}</Text>
                </Alert>
            )}
            {esFactura && montoIva > 0 && retencionModo === 'despues' && (
                <Text size="xs" c="orange.8" mt="xs">Quedará «Falta retener»: el comprobante sale con el siguiente número cuando la pagues (Compras → Por pagar → Pagar y retener).</Text>
            )}
            {esFactura && montoIva > 0 && retencionModo === 'ahora' && formCompra.values.condicionPago === 'Contado' && formCompra.values.metodoPago === 'Punto de Venta' && (
                // Providencia de retenciones de IVA, art. 5: no se retiene lo pagado con tarjeta de débito o crédito cuyo titular es el agente de retención
                <Group gap={6} mt="xs" wrap="wrap">
                    <Text size="xs" c="orange.8">Pagada con la tarjeta de la empresa: la providencia de retenciones de IVA excluye de la retención lo pagado con tarjeta de débito o crédito a nombre del agente de retención (confírmalo con el contador).</Text>
                    <Button size="compact-xs" variant="light" color="orange" onClick={() => formCompra.setFieldValue('retencionModo', 'no')}>No retener</Button>
                </Group>
            )}
            {!esFactura && <Text size="xs" c="dimmed" mt="xs">La nota de entrega no es un documento fiscal: se registra sin IVA, sin retención y sin número de control, y no entra al libro de compras. {esGasto ? 'Al ser un gasto, no mueve el inventario.' : 'El inventario y el costo se actualizan igual.'}</Text>}
            {lectura && (
                <>
                    {lectura.avisos.length > 0 && (
                        <Alert mt="xs" p="xs" color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title="Revisa lo que leyó la IA"
                            withCloseButton onClose={() => setLectura((l) => ({ ...l, avisos: [] }))}>
                            <Stack gap={2}>{lectura.avisos.map((a, i) => <Text key={i} size="xs">{a}</Text>)}</Stack>
                        </Alert>
                    )}
                    {/* En el gasto el IVA lo calcula el servidor sobre la base: no se ajusta al impreso */}
                    {(esGasto ? subtotal > 0 : carritoCompra.length > 0) && (
                        <CuadreFactura
                            impreso={lectura.impreso} simbolo={sim} tasa={tasa}
                            calculado={{ base: r2(subtotal - montoExento), exento: montoExento, ivaCalculado: esGasto ? montoIva : montoIvaCalculado, total: totalFinal }}
                            renglonesFactura={esGasto ? 0 : lectura.renglones} renglonesCompra={esGasto ? 0 : carritoCompra.length}
                            ivaAjustado={esGasto ? null : ivaAjustado} onUsarIvaImpreso={esGasto ? null : () => setIvaAjustado(Number(lectura.impreso.montoIva))} onQuitarAjuste={() => setIvaAjustado(null)}
                        />
                    )}
                    {!esGasto && revision === null && lectura.renglones > 0 && (
                        <Button mt={6} size="compact-xs" variant="subtle" color="grape" leftSection={<IconSparkles size={14} />}
                            onClick={() => setRevision(prepararRenglones(lectura.lineas || [], productos || [], lectura.equivalencias || []))}>
                            Volver a ver los renglones leídos
                        </Button>
                    )}
                </>
            )}
        </Box>
    );

    // ---- Datos del gasto ----
    const camposGasto = (
        <Stack gap="sm">
            <TextInput size="sm" label="¿En qué fue el gasto?" placeholder="Ej: Flete de Maracaibo, alquiler del galpón, reparación del montacargas" withAsterisk maxLength={200}
                value={gasto.descripcion} onChange={(e) => setGasto({ ...gasto, descripcion: e.currentTarget.value })} />
            <Select size="sm" label="Categoría del gasto" placeholder="Elige la categoría" searchable withAsterisk
                data={(categoriasGasto || []).map((c) => ({ value: String(c.id), label: c.nombre }))}
                value={gasto.categoriaId} onChange={(v) => setGasto({ ...gasto, categoriaId: v })}
                nothingFoundMessage="No hay categorías de gasto: créalas en Finanzas" />
            <Group grow align="flex-start">
                <NumberInput size="sm" label="Monto gravado (base imponible)" description={esFactura ? `Se le suma el IVA ${CONFIG_FISCAL.alicuotaGeneral}%` : 'La nota de entrega no lleva IVA'} min={0} decimalScale={2} hideControls
                    value={gasto.base} onChange={(v) => setGasto({ ...gasto, base: v })} />
                <NumberInput size="sm" label="Monto exento (sin IVA)" min={0} decimalScale={2} hideControls
                    value={gasto.exento} onChange={(v) => setGasto({ ...gasto, exento: v })} />
            </Group>
        </Stack>
    );

    // ---- Productos seleccionados: tarjetas en móvil ----
    const listaMovil = (
        <Stack gap={6} mb="sm">
            {carritoCompra.length === 0 && <Text size="sm" c="dimmed" ta="center" py="md">Toca un producto de la lista para agregarlo.</Text>}
            {carritoCompra.map(item => {
                const costoAntMon = aMon(item.costoAnterior);
                const diferencia = item.precioCompraUnitario - costoAntMon;
                const variacionPorcentual = costoAntMon > 0 ? ((diferencia / costoAntMon) * 100).toFixed(1) : 100;
                return (
                    <Paper key={item.id} withBorder p="xs" radius="md">
                        <Group justify="space-between" wrap="nowrap" align="flex-start" mb={4}>
                            <Box style={{ minWidth: 0, flex: 1 }}>
                                <Text fw={700} size="sm" lineClamp={2} lh={1.25}>{item.nombre}</Text>
                                <Text size="xs" c="dimmed">{item.marca ? `${item.marca} · ` : ''}SKU: {item.codigo} · costo ant. <PrecioVisual valor={item.costoAnterior} simbolo="$" size="xs" c="dimmed" />{esBs && <> · <PrecioVisual valor={costoAntMon} simbolo="Bs" size="xs" c="dimmed" /></>}</Text>
                            </Box>
                            <ActionIcon color="red" variant="subtle" size="md" onClick={() => eliminarItem(item.id)}><IconTrash size={18}/></ActionIcon>
                        </Group>
                        <SegmentedControl
                            fullWidth size="xs" mb={6} value={item.unidadCompra} onChange={(v) => cambiarUnidadCompra(item.id, v)}
                            data={[
                                { value: 'unidad', label: 'Unidades' },
                                ...(item.undPorCaja > 0 ? [{ value: 'caja', label: `Caja (${item.undPorCaja})` }] : []),
                                ...(item.undPorBulto > 1 ? [{ value: 'bulto', label: `Bulto (${item.undPorBulto})` }] : []),
                            ]}
                        />
                        <Group gap={8} wrap="nowrap" align="flex-start">
                            <Group gap={4} wrap="nowrap">
                                <ActionIcon size="lg" variant="light" onClick={() => cambiarCantidad(item.id, -1)}><IconMinus size={16}/></ActionIcon>
                                <NumberInput value={item.cantidadCompra} onChange={(v) => actualizarCantidadCompra(item.id, v)} onBlur={() => confirmarCantidadCompra(item.id)} selectAllOnFocus inputMode="numeric" min={1} allowDecimal={false} allowNegative={false} hideControls w={70} size="sm" styles={{ input: { textAlign: 'center', paddingInline: 4 } }} />
                                <ActionIcon size="lg" variant="light" onClick={() => cambiarCantidad(item.id, 1)}><IconPlus size={16}/></ActionIcon>
                            </Group>
                            <Box style={{ flex: 1, minWidth: 0 }}>
                                <NumberInput value={item.precioCompra} onChange={(val) => actualizarPrecioCompra(item.id, val)} decimalScale={4} size="sm" leftSection={esBs ? 'Bs' : '$'} leftSectionWidth={esBs ? 36 : undefined} />
                            </Box>
                        </Group>
                        <EditorEmpaque item={item} onCambiar={(c, v) => cambiarEmpaque(item.id, c, v)} />
                        <Text size="xs" c="dimmed" mt={4}>
                            por {item.unidadCompra}{item.unidadCompra !== 'unidad' ? ` = ${item.cantidad.toLocaleString('es-VE')} und · ${item.precioCompraUnitario.toFixed(4)} c/u` : ''}
                            {esBs && tasa > 0 && ` · ≈ $${(item.precioCompraUnitario / tasa).toFixed(4)} c/u`}
                            {diferencia !== 0 && <Text span size="xs" fw={700} c={diferencia > 0 ? 'red' : 'teal'}> · {diferencia > 0 ? `▲ +${variacionPorcentual}%` : `▼ ${variacionPorcentual}%`}</Text>}
                        </Text>
                    </Paper>
                );
            })}
        </Stack>
    );

    // ---- Productos seleccionados: tabla compacta con cabecera fija en escritorio ----
    const tablaEscritorio = (
        <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
            <Table stickyHeader highlightOnHover verticalSpacing={6} horizontalSpacing="sm">
                <Table.Thead style={{ background: 'var(--mantine-color-gray-0)', zIndex: 2 }}>
                    <Table.Tr>
                        <Table.Th>Producto</Table.Th>
                        <Table.Th>¿Qué recibes?</Table.Th>
                        <Table.Th>Costo actual / und</Table.Th>
                        <Table.Th>Precio de compra</Table.Th>
                        <Table.Th ta="right">Subtotal</Table.Th>
                        <Table.Th w={44}></Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {carritoCompra.length === 0 && (
                        <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py={60}>Aún no hay productos. Elige uno de la lista de la izquierda para agregarlo.</Text></Table.Td></Table.Tr>
                    )}
                    {carritoCompra.map(item => {
                        const costoAntMon = aMon(item.costoAnterior);
                const diferencia = item.precioCompraUnitario - costoAntMon;
                        const variacionPorcentual = costoAntMon > 0 ? ((diferencia / costoAntMon) * 100).toFixed(1) : 100;
                        return (
                            <Table.Tr key={item.id}>
                                <Table.Td style={{ maxWidth: 260 }}>
                                    <Text fw={600} size="sm" lineClamp={2} lh={1.25}>{item.nombre}</Text>
                                    <Text size="xs" c="dimmed">{item.marca ? `${item.marca} · ` : ''}SKU: {item.codigo}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Stack gap={4} align="flex-start">
                                        <SegmentedControl
                                            size="xs" value={item.unidadCompra} onChange={(v) => cambiarUnidadCompra(item.id, v)}
                                            data={[
                                                { value: 'unidad', label: 'Und' },
                                                ...(item.undPorCaja > 0 ? [{ value: 'caja', label: `Caja (${item.undPorCaja})` }] : []),
                                                ...(item.undPorBulto > 1 ? [{ value: 'bulto', label: `Bulto (${item.undPorBulto})` }] : []),
                                            ]}
                                        />
                                        <Group gap={6} wrap="nowrap">
                                            <ActionIcon size="md" variant="light" onClick={() => cambiarCantidad(item.id, -1)}><IconMinus size={14}/></ActionIcon>
                                            <NumberInput value={item.cantidadCompra} onChange={(v) => actualizarCantidadCompra(item.id, v)} onBlur={() => confirmarCantidadCompra(item.id)} selectAllOnFocus inputMode="numeric" min={1} allowDecimal={false} allowNegative={false} hideControls w={72} size="sm" styles={{ input: { textAlign: 'center', paddingInline: 4 } }} />
                                            <ActionIcon size="md" variant="light" onClick={() => cambiarCantidad(item.id, 1)}><IconPlus size={14}/></ActionIcon>
                                            {item.unidadCompra !== 'unidad' && <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>= {item.cantidad.toLocaleString('es-VE')} und</Text>}
                                        </Group>
                                        <EditorEmpaque item={item} onCambiar={(c, v) => cambiarEmpaque(item.id, c, v)} />
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    <PrecioVisual valor={item.costoAnterior} simbolo="$" size="sm" c="dimmed" />
                                    {esBs && <PrecioVisual valor={costoAntMon} simbolo="Bs" size="sm" c="dimmed" />}
                                </Table.Td>
                                <Table.Td>
                                    <NumberInput value={item.precioCompra} onChange={(val) => actualizarPrecioCompra(item.id, val)} decimalScale={4} w={esBs ? 150 : 120} size="sm" leftSection={esBs ? 'Bs' : '$'} leftSectionWidth={esBs ? 36 : undefined} />
                                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                        por {item.unidadCompra}{item.unidadCompra !== 'unidad' ? ` → ${item.precioCompraUnitario.toFixed(4)} c/u` : ''}
                                        {esBs && tasa > 0 && ` · ≈ $${(item.precioCompraUnitario / tasa).toFixed(4)} c/u`}
                                        {diferencia !== 0 && <Text span size="xs" fw={700} c={diferencia > 0 ? 'red' : 'teal'}> · {diferencia > 0 ? `▲ +${variacionPorcentual}%` : `▼ ${variacionPorcentual}%`}</Text>}
                                    </Text>
                                </Table.Td>
                                <Table.Td ta="right"><PrecioVisual valor={montoLinea(item)} simbolo={sim} size="sm" fw={700} /></Table.Td>
                                <Table.Td><ActionIcon color="red" variant="subtle" size="lg" onClick={() => eliminarItem(item.id)}><IconTrash size={18}/></ActionIcon></Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </ScrollArea>
    );

    const panelSeleccion = (
        <Paper withBorder p="sm" radius="md" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
            <Group justify="space-between" mb={6}>
                <Text fw={700} size="sm">{esGasto ? 'Datos del gasto' : 'Productos seleccionados'}</Text>
                {!esGasto && <Badge variant="light" size="lg">{carritoCompra.length}</Badge>}
            </Group>
            {esGasto ? camposGasto : tablaEscritorio}
        </Paper>
    );

    // ---- Totales y botón de registrar ----
    const pieEscritorio = (
        <Paper withBorder p="sm" radius="md" style={{ flex: '0 0 auto' }}>
            <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="xl" align="flex-end">
                    <Box><Text size="xs" c="dimmed">Subtotal</Text><PrecioVisual valor={subtotal} simbolo={sim} size="md" fw={600} /></Box>
                    {esFactura && <Box><Text size="xs" c="dimmed">IVA ({CONFIG_FISCAL.alicuotaGeneral}%)</Text><PrecioVisual valor={montoIva} simbolo={sim} size="md" fw={600} /></Box>}
                    {montoRetencion > 0 && (
                        <Box>
                            <Text size="xs" c="red">Retención (−)</Text>
                            <Text c="red" fw={700}><PrecioVisual valor={montoRetencion} simbolo={sim} size="md" fw={700} c="red" /></Text>
                            {serieRet?.configurado && <Text size="xs" c="dimmed">Comprobante N° {periodoRet}{serieRet.siguiente}</Text>}
                        </Box>
                    )}
                    <Box><Text size="xs" c="dimmed">Total</Text><PrecioVisual valor={totalFinal} simbolo={sim} size="xl" fw={900} c="blue.9" /></Box>
                </Group>
                <Button size="lg" color="green.8" leftSection={<IconCheck size={22} />} onClick={accionRegistrar} loading={isSubmitting} disabled={registroBloqueado}>{labelBoton}</Button>
            </Group>
        </Paper>
    );

    const pieMovil = (
        <Box style={{ position: 'sticky', bottom: 0, zIndex: 15, background: '#fff', margin: '6px -8px -8px', padding: '8px 12px calc(8px + env(safe-area-inset-bottom))', boxShadow: '0 -6px 16px rgba(0,0,0,0.12)', borderTop: '1px solid var(--mantine-color-gray-3)' }}>
            <Group justify="space-between" mb={6} wrap="nowrap">
                <Text size="xs" c="dimmed">Subtotal <PrecioVisual valor={subtotal} simbolo={sim} size="xs" />{esFactura && <> · IVA <PrecioVisual valor={montoIva} simbolo={sim} size="xs" /></>}{montoRetencion > 0 && <Text span size="xs" c="red" fw={700}> · Ret. −<PrecioVisual valor={montoRetencion} simbolo={sim} size="xs" /></Text>}</Text>
                <Text fw={900} size="lg" c="blue.9" style={{ whiteSpace: 'nowrap' }}><PrecioVisual valor={totalFinal} simbolo={sim} size="lg" fw={900} c="blue.9" /></Text>
            </Group>
            <Button fullWidth size="md" color="green.8" tt="none" leftSection={<IconCheck size={20} />} onClick={accionRegistrar} loading={isSubmitting} disabled={registroBloqueado}>{labelBoton}</Button>
        </Box>
    );

    return (
        <>
            <Modal opened={opened} onClose={onClose} fullScreen title={<Title order={isMobile ? 5 : 3} c="blue.9" tt={isMobile ? 'none' : undefined}>{esGasto ? 'Registrar gasto' : (isMobile ? 'Registrar compra' : 'Registrar factura / nota de compra (proveedor)')}</Title>}
                styles={isMobile
                    ? { content: { padding: 0 }, header: { padding: '8px 12px', minHeight: 44, background: '#fff', zIndex: 30 }, body: { padding: '0 4px' } }
                    : { content: { display: 'flex', flexDirection: 'column', overflow: 'hidden' }, header: { padding: '10px 20px' }, body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 20px 16px', overflow: 'hidden' } }}>

                {isMobile ? (
                    <Box p={4}>
                        {declaracion}
                        {avisoRetencion && <Box mb={6}>{avisoRetencion}</Box>}
                        <Stack gap="xs">
                            {panelCatalogo}
                            <Paper withBorder p="xs" radius="md">
                                {datosDocumento}
                                <Divider my="xs" />
                                {esGasto ? <Box mb="sm">{camposGasto}</Box> : listaMovil}
                                {pieMovil}
                            </Paper>
                        </Stack>
                    </Box>
                ) : (
                    <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 1800, marginInline: 'auto' }}>
                        {declaracion}
                        {avisoRetencion}
                        <Paper withBorder p="sm" radius="md" style={{ flex: '0 0 auto' }}>{datosDocumento}</Paper>
                        <Box style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
                            {panelCatalogo}
                            {panelSeleccion}
                        </Box>
                        {pieEscritorio}
                    </Box>
                )}

                {/* Renglones leídos de la factura: la persona elige el producto de cada uno antes de pasarlos a la compra */}
                {revision && (
                    <RevisionRenglonesIA opened onClose={() => setRevision(null)} renglonesIniciales={revision} productos={productos || []}
                        simbolo={lectura?.simbolo || sim} proveedorNombre={lectura?.proveedorNombre} onConfirmar={agregarDesdeFactura} />
                )}

                {/* MODAL SECUNDARIO: CREAR PROVEEDOR EN CALIENTE */}
                <Modal opened={modalCrearProv} onClose={() => setModalCrearProv(false)} size="lg" title={<Title order={3} c="grape">Registrar Nuevo Proveedor</Title>} centered zIndex={2000}>
                    <form onSubmit={formNuevoProv.onSubmit(async (values) => {
                        try {
                            const res = await fetch('/api/proveedores', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error);

                            notifications.show({ title: 'Proveedor Creado', message: 'Guardado y seleccionado.', color: 'green' });
                            queryClient.invalidateQueries({ queryKey: ['proveedores-compra'] });
                            formCompra.setFieldValue('proveedorId', String(data.id));
                            setModalCrearProv(false);
                            formNuevoProv.reset();
                        } catch (err) {
                            notifications.show({ title: 'Error', message: err.message, color: 'red' });
                        }
                    })}>
                        <Stack gap="md">
                            <TextInput size={isMobile ? 'sm' : 'md'} label="RIF" withAsterisk {...formNuevoProv.getInputProps('identificacion')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Razón Social" withAsterisk {...formNuevoProv.getInputProps('nombre')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Teléfono" {...formNuevoProv.getInputProps('telefono')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Email" {...formNuevoProv.getInputProps('email')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Dirección" {...formNuevoProv.getInputProps('direccion')} />
                            {/* El SENIAT dice si a este proveedor se le retiene el 75 % o el 100 % del IVA (su consulta tiene captcha: se abre aparte) */}
                            <Alert color="blue" variant="light" p="xs" title="¿Se le retiene 75 % o 100 %?">
                                <Text size="xs" mb={6}>Consulta el RIF en el portal del SENIAT: el resultado dice su porcentaje de retención de IVA y si es contribuyente especial. Al abrirlo se copia el RIF para que lo pegues.</Text>
                                <Button size="xs" variant="white" leftSection={<IconExternalLink size={14} />}
                                    onClick={() => {
                                        const rif = normRif(formNuevoProv.values.identificacion);
                                        if (rif) navigator.clipboard?.writeText(rif).catch(() => {});
                                        window.open(URL_SENIAT_RIF, '_blank', 'noopener');
                                    }}>
                                    Consultar RIF en el SENIAT{normRif(formNuevoProv.values.identificacion) ? ` (${normRif(formNuevoProv.values.identificacion)})` : ''}
                                </Button>
                            </Alert>
                            <Group grow>
                                <Checkbox label="Contribuyente Especial" size="md" mt={8} {...formNuevoProv.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })} />
                                <Select size={isMobile ? 'sm' : 'md'} label="Retención Default" data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} value={String(formNuevoProv.values.retencionIvaPorDefecto)} onChange={(v) => formNuevoProv.setFieldValue('retencionIvaPorDefecto', Number(v) === 100 ? 100 : 75)} allowDeselect={false} />
                            </Group>
                            <Button size="md" type="submit" color="grape" mt="md">Guardar Proveedor</Button>
                        </Stack>
                    </form>
                </Modal>
            </Modal>

            {/* 🔥 MODAL PROMPT DE DECISIÓN DE PRECIOS PONDERADOS AMPLIADO A FULLSCREEN 🔥 */}
            <Modal opened={modalSimulacionAbierto} onClose={() => setModalSimulacionAbierto(false)} fullScreen title={<Title order={2} c="orange.8"><IconAlertTriangle size={24} style={{verticalAlign: 'middle'}} /> Auditoría de Costos Ponderados y Stock</Title>} zIndex={3000}>
                <Box p="lg" maw={1500} mx="auto">
                    <Stack gap="lg">
                        <Alert color="orange" variant="light" p="md">
                            <Text fw={700} size="md">{promptTexto}</Text>
                        </Alert>

                        <ScrollArea h="55vh">
                            <Table striped highlightOnHover verticalSpacing="md">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th><Text size="sm">Producto</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">Stock Previo / Compra</Text></Table.Th>
                                        {!soloRegistro && <>
                                        <Table.Th ta="center"><Text size="sm">Costo Ponderado</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">Aumento</Text></Table.Th>
                                        <Table.Th><Text size="sm">Precio 6 (Actual ➔ Nuevo)</Text></Table.Th>
                                        <Table.Th><Text size="sm">Precio 7 (Actual ➔ Nuevo)</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">¿Modificar?</Text></Table.Th>
                                        </>}
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {datosSimulacion?.map((sim) => {
                                        const itemCarrito = carritoCompra.find(i => i.id === sim.productoId);
                                        return (
                                            <Table.Tr key={sim.productoId}>
                                                <Table.Td>
                                                    <Text fw={700} size="md">{sim.nombre}</Text>
                                                    <Text size="sm" c="dimmed">SKU: {sim.codigo}</Text>
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Badge size="lg" variant="outline" color="blue">
                                                        Existía: {sim.stockActual} | Entran: +{sim.cantidadComprada}
                                                    </Badge>
                                                </Table.Td>
                                                {!soloRegistro && <>
                                                <Table.Td ta="center">
                                                    <Text size="sm" c="dimmed">Ant: ${sim.costoActual}{esBs && ` · Bs ${(sim.costoActual * tasa).toFixed(2)}`}</Text>
                                                    <Text size="md" fw={700} c="teal">Nuevo: ${sim.nuevoCostoPonderado}{esBs && ` · Bs ${(sim.nuevoCostoPonderado * tasa).toFixed(2)}`}</Text>
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Badge color={sim.porcentajeAumento >= 0 ? 'red' : 'teal'} size="lg" variant="filled">
                                                        {sim.porcentajeAumento >= 0 ? `+${sim.porcentajeAumento}%` : `${sim.porcentajeAumento}%`}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="md">${sim.precio6.actual} ➔ <Text span fw={700} c="blue" size="lg">${sim.precio6.nuevo}</Text></Text>
                                                    {esBs && <Text size="xs" c="dimmed">Bs {(sim.precio6.actual * tasa).toFixed(2)} ➔ Bs {(sim.precio6.nuevo * tasa).toFixed(2)}</Text>}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="md">${sim.precio7.actual} ➔ <Text span fw={700} c="blue" size="lg">${sim.precio7.nuevo}</Text></Text>
                                                    {esBs && <Text size="xs" c="dimmed">Bs {(sim.precio7.actual * tasa).toFixed(2)} ➔ Bs {(sim.precio7.nuevo * tasa).toFixed(2)}</Text>}
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Checkbox 
                                                        size="md"
                                                        checked={itemCarrito?.aceptarCambioPrecio ?? true}
                                                        onChange={() => toggleAceptarCambioItem(sim.productoId)}
                                                        label="Aceptar"
                                                    />
                                                </Table.Td>
                                                </>}
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>

                        <Group justify="flex-end" mt="xl" gap="md">
                            <Button size="lg" variant="default" onClick={() => setModalSimulacionAbierto(false)}>Cancelar</Button>
                            <Button size="lg" color="green" onClick={handleEjecutarCompraFinal} loading={isSubmitting}>
                                Confirmar y Ejecutar Compra
                            </Button>
                        </Group>
                    </Stack>
                </Box>
            </Modal>
        </>
    );
}