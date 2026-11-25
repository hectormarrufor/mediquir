'use client';

import React, { useState } from 'react';
import {
    ActionIcon, Alert, Badge, Box, Button, Card, Center, Divider, Grid, Group, Loader,
    Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Stepper, Switch, Table, Tabs,
    Text, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { useVolver } from '@/app/helpers/useVolver';
import { useQuery } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { desgloseFactura } from '@/app/helpers/desgloseFactura';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import {
    IconAlertTriangle, IconArrowLeft, IconCash, IconCheck, IconClock, IconCurrencyDollar,
    IconEdit, IconFileCheck, IconMapPin, IconPackage, IconPrinter, IconReceiptTax,
    IconReportMoney, IconTruck, IconUser, IconUsers,
} from '@tabler/icons-react';
import { PANTALLA_COMPLETA_MOVIL, useEsTelefono } from '@/app/components/ui/modalMovil';
import { notifications } from '@mantine/notifications';
import PrecioVisual from '@/app/components/ui/PrecioVisual';
import RetencionIvaCard from '../_components/RetencionIvaCard';
import CambioDeudaModal from '@/app/superuser/cxc/_components/CambioDeudaModal';
import OfertaReciboAbono from '@/app/superuser/cxc/_components/OfertaReciboAbono';
import EvidenciaEmpaque from '../_components/EvidenciaEmpaque';
import RevisionExistencias from '../_components/RevisionExistencias';
import EnvioCard from '../_components/EnvioCard';
import EntregaChoferForm from '@/app/components/admin/EntregaChoferForm';
import EntregaChoferCard from '../_components/EntregaChoferCard';
import PagoPorVerificarCard from '../_components/PagoPorVerificarCard';
import { aInputFechaHora, formatearFecha, formatearFechaHora } from '@/app/constants/hora';
import NotasFacturaCard from '../_components/NotasFacturaCard';
import FacturarNotasModal from '../_components/FacturarNotasModal';
import CorregirFacturaModal from '../_components/CorregirFacturaModal';
import GestionNcEmpaqueModal from '../_components/GestionNcEmpaqueModal';
import DatosDeCopia from '@/app/components/admin/DatosDeCopia';
import { useAuth } from '@/hooks/useAuth';

const fmtBsNum = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

function KpiCard({ icono: Icono, color, titulo, valor, detalle, accion, onClick }) {
    return (
        <Card
            withBorder
            radius="lg"
            p={{ base: 'sm', sm: 'md' }}
            bg="white"
            h="100%"
            onClick={onClick}
            style={{
                boxShadow: 'var(--mm-shadow-card)',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'transform .15s ease',
            }}
        >
            <Stack gap={6} h="100%" justify="space-between">
                <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" lineClamp={1}>{titulo}</Text>
                    <ThemeIcon size={30} radius="md" variant="light" color={color} style={{ flexShrink: 0 }}>
                        <Icono size={16} />
                    </ThemeIcon>
                </Group>
                <Box>
                    {valor}
                    {detalle && <Text size="xs" c="dimmed" mt={2} lineClamp={2}>{detalle}</Text>}
                </Box>
                {accion && <Box mt={2}>{accion}</Box>}
            </Stack>
        </Card>
    );
}

export default function DetallePedidoMayorPage() {
    const params = useParams();
    const router = useRouter();
    const volver = useVolver('/superuser/ventas');
    const { userId, esVendedor, rolUsuario } = useAuth();

    const [tabActiva, setTabActiva] = useState('resumen');
    const [galeriaModal, setGaleriaModal] = useState({ imagenes: [], indice: 0 });
    const [modalEmpacar, setModalEmpacar] = useState(false);
    const [modalDespacho, setModalDespacho] = useState(false);
    const [modalAbono, setModalAbono] = useState(false);
    const [ofertaRecibo, setOfertaRecibo] = useState(null);
    const [modalAbonoCxc, setModalAbonoCxc] = useState(false);
    const [modalCobroTienda, setModalCobroTienda] = useState(false);
    const [cobroTienda, setCobroTienda] = useState({ metodoPago: 'Efectivo ($)', referencia: '' });
    const [modalFactura, setModalFactura] = useState(false);
    const [copiaFactura, setCopiaFactura] = useState({ numero: '', control: '', fecha: '' });
    const [modalNotaAFactura, setModalNotaAFactura] = useState(false);
    const [aprobando, setAprobando] = useState(false);
    const [modalCorregir, setModalCorregir] = useState(false);
    const [modalGestionNc, setModalGestionNc] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isMobile = useEsTelefono();
    const { tasa: precioBCV } = useTasaBcv();

    const { data: pedido, isLoading, refetch } = useQuery({
        queryKey: ['pedido-detalle', params.id],
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${params.id}`);
            if (!res.ok) throw new Error('Error al cargar el pedido');
            return res.json();
        },
    });

    const { data: empleados } = useQuery({
        queryKey: ['personal-asignable'],
        enabled: !esVendedor,
        queryFn: async () => {
            const res = await fetch('/api/logistica/asignables');
            if (!res.ok) return [];
            return res.json();
        },
    });

    const formEmpacar = useForm({ initialValues: { empacadorId: '', etiquetadorId: '' } });
    const formDespacho = useForm({ initialValues: { quienRetira: '', fechaHoraRetiro: aInputFechaHora(), costoFlete: 0 } });
    const formAbono = useForm({ initialValues: { montoAbono: 0, metodoPago: 'Transferencia', referencia: '', monedaAbono: 'USD', retuvo: false, cierra: false } });

    if (isLoading) {
        return (
            <Center py={80}>
                <Stack align="center" gap="xs">
                    <Loader size="md" color="white" />
                    <Text c="gray.3" size="sm">Cargando detalle de factura...</Text>
                </Stack>
            </Center>
        );
    }
    if (!pedido) {
        return (
            <Box p="md" maw={600} mx="auto">
                <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Documento no encontrado">
                    No se encontró la venta solicitada.
                </Alert>
            </Box>
        );
    }

    const cancelado = pedido.statusDespacho === 'Cancelado';
    const empaqueNc = pedido.empaqueNc || null;
    const ncPorDetalle = new Map((empaqueNc?.cambios || []).map((c) => [c.detalleId, c]));
    const empaqueAnulado = (!pedido.empacadoAt && Boolean(empaqueNc?.anuladaTotalParaEmpaque)) || empaqueNc?.estadoEfectivo === 'DESARMADO';
    const soyEmpacador = Boolean(userId && pedido.empacadorId) && Number(pedido.empacadorId) === Number(userId);
    const soyEtiquetador = Boolean(userId && pedido.etiquetadorId) && Number(pedido.etiquetadorId) === Number(userId);
    const soyVendedorPedido = Boolean(userId && pedido.vendedorId) && Number(pedido.vendedorId) === Number(userId);
    let pasoActual = 0;
    if (pedido.statusDespacho === 'Empacado' || pedido.statusDespacho === 'Parcial') pasoActual = 1;
    if (pedido.statusDespacho === 'Completado') pasoActual = 3;

    const esNacional = pedido.tipoVenta === 'ONLINE' && pedido.tipoEntrega === 'flete';
    const cuentaPorCobrar = Array.isArray(pedido.cuentaPorCobrar) ? (pedido.cuentaPorCobrar[0] || null) : (pedido.cuentaPorCobrar || null);
    const esCredito = pedido.condicionPago === 'Credito';
    const monedaCuenta = cuentaPorCobrar?.moneda || pedido.moneda;
    const pagado = pedido.statusPago === 'Pagado';
    const cobrableSinCuenta = !cuentaPorCobrar && !pagado && !cancelado && Boolean(pedido.clienteId)
        && pedido.verificacionPago !== 'POR_VERIFICAR' && pedido.revisionStock !== 'PENDIENTE';
    const abonadoDoc = (pedido.abonos || []).reduce((a, x) => a + Number(pedido.moneda === 'BS' ? x.montoVes : x.montoUsd), 0);
    const saldoCuenta = cuentaPorCobrar
        ? (Number(cuentaPorCobrar.saldoPendiente) || 0)
        : (cobrableSinCuenta ? Math.max(0, Number((Number(pedido.totalFinal) - abonadoDoc).toFixed(2))) : 0);

    const tasaDoc = Number(pedido.tasaCambio) || 1;
    const aplicaRetencionIva = pedido.tipoDocumento === 'FACTURA' && Number(pedido.montoIva) > 0;
    const retencion = (pedido.retenciones || [])[0] || null;
    const puedeRetener = aplicaRetencionIva && !retencion;
    const retEsperada = puedeRetener ? Math.round(Number(pedido.montoIva) * 75) / 100 : 0;
    const ivaBs = pedido.moneda === 'BS' ? Number(pedido.montoIva) : aBolivares(Number(pedido.montoIva), tasaDoc);
    const retEsperadaBs = Math.round(ivaBs * 75) / 100;

    const montoEnCuenta = formAbono.values.monedaAbono === monedaCuenta
        ? Number(formAbono.values.montoAbono) || 0
        : (precioBCV > 0 ? (monedaCuenta === 'USD' ? aDolares(Number(formAbono.values.montoAbono) || 0, precioBCV) : aBolivares(Number(formAbono.values.montoAbono) || 0, precioBCV)) : 0);
    const parecioRetener = puedeRetener && montoEnCuenta > 0 && Math.abs(montoEnCuenta + retEsperada - saldoCuenta) <= (monedaCuenta === 'USD' ? 1 : 1 * tasaDoc);
    const equivalente = (v) => (pedido.moneda === 'BS'
        ? `$${aDolares(Number(v) || 0, tasaDoc).toFixed(2)}`
        : `Bs ${aBolivares(Number(v) || 0, tasaDoc).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    // --- HANDLERS ---
    const handleAction = async (accion, bodyData, modalSetter, successMsg) => {
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/ventas/${params.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion, ...bodyData }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Error en ${accion}`);

            notifications.show({ title: 'Éxito', message: successMsg, color: 'green' });
            if (data.avisoNumero) notifications.show({ color: 'orange', title: 'Aviso sobre el número', message: data.avisoNumero, autoClose: 20000, withCloseButton: true });
            if (modalSetter) modalSetter(false);
            refetch();
            return data;
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmarEmpaque = (values) => handleAction('EMPACAR', { ...values, vendedorId: userId }, setModalEmpacar, 'Caja armada y stock descontado.');
    const handleAsignar = (values) => handleAction('ASIGNAR', values, setModalEmpacar, 'Personal asignado. Les avisamos para que preparen el pedido.');
    const handleConvertirFactura = () => handleAction('CONVERTIR_A_FACTURA', { numeroFactura: copiaFactura.numero, numeroControl: copiaFactura.control, fecha: copiaFactura.fecha }, setModalFactura, 'Convertido en factura. Ya aparece en el libro de ventas.');
    const handleFirmar = (accion, mensaje) => handleAction(accion, {}, null, mensaje);
    const handleConfirmarDespacho = (values) => handleAction('DESPACHAR', values, setModalDespacho, 'Despacho registrado y flete asentado.');

    const handleRegistrarAbono = (values) => {
        if (!(Number(values.montoAbono) > 0)) return notifications.show({ message: 'El monto debe ser mayor a 0', color: 'red' });
        if (values.monedaAbono !== monedaCuenta && !(precioBCV > 0)) return notifications.show({ message: 'Todavía no hay tasa BCV para convertir el pago: espera un momento e intenta de nuevo', color: 'red' });

        return handleAction('ABONAR', {
            montoAbono: values.montoAbono,
            metodoPago: values.metodoPago,
            referencia: values.referencia,
            monedaAbono: values.monedaAbono,
            tasaCambioAbono: precioBCV,
            retencion: values.retuvo && puedeRetener,
            cierraFactura: values.cierra,
        }, setModalAbono, 'Abono registrado y saldo actualizado.').then((d) => {
            if (d?.abonoId && !/retenci|nota de cr/i.test(String(values.metodoPago || ''))) {
                setOfertaRecibo({ abonoId: d.abonoId, resumen: `Abono registrado en ${pedido.numeroDocumento}.` });
            }
        });
    };

    const abrirAbono = () => {
        if (cuentaPorCobrar && cuentaPorCobrar.moneda === 'USD' && !cuentaPorCobrar.notaId) {
            setModalAbonoCxc(true);
            return;
        }
        formAbono.setValues({ montoAbono: saldoCuenta, metodoPago: 'Transferencia', referencia: '', monedaAbono: monedaCuenta, retuvo: false, cierra: false });
        setModalAbono(true);
    };

    const aprobarFactura = async () => {
        setAprobando(true);
        try {
            const res = await fetch('/api/ventas/por-aprobar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo: 'VENTA', id: pedido.id }),
            });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo aprobar');
            notifications.show({ title: 'Factura aprobada', message: `${pedido.numeroDocumento} ya se puede imprimir.`, color: 'green' });
            refetch();
        } catch (e) {
            notifications.show({ title: 'Error', message: e.message, color: 'red' });
        } finally {
            setAprobando(false);
        }
    };

    const opcionesEmpleados = empleados?.map((e) => ({ value: String(e.id), label: e.nombre })) || [];

    const obtenerTodasLasImagenes = (producto) => {
        if (!producto) return [];
        const lista = [];
        if (producto.imagen) lista.push({ titulo: 'Imagen del Producto', url: `${process.env.NEXT_PUBLIC_IMG_BASE}/${producto.imagen}` });
        if (producto.grupoEquivalencia?.imagen) lista.push({ titulo: 'Grupo de Equivalencia', url: `${process.env.NEXT_PUBLIC_IMG_BASE}/${producto.grupoEquivalencia.imagen}` });
        if (producto.marca?.imagen) lista.push({ titulo: `Marca: ${producto.marca.nombre || 'N/A'}`, url: `${process.env.NEXT_PUBLIC_IMG_BASE}/${producto.marca.imagen}` });
        return lista;
    };

    const tituloDoc = `${pedido.tipoDocumento === 'FACTURA' ? 'Factura' : pedido.tipoDocumento === 'NOTA_ENTREGA' ? 'Nota de entrega' : 'Recibo'} ${pedido.numeroDocumento}`;
    const reemplazos = pedido.reemplazadaPorTodas || (pedido.reemplazadaPor ? [pedido.reemplazadaPor] : []);
    const abonosOrdenados = [...(pedido.abonos || [])].sort((a, b) => String(a.fechaPago).localeCompare(String(b.fechaPago)) || a.id - b.id);
    const nombreRenglon = (d) => (d.isFicticio ? d.nombreFicticio : d.producto?.nombre);
    const presentacionRenglon = (d) => (d.presentacionPedida && d.presentacionPedida !== 'UNIDAD' && d.cantidadPresentacion
        ? `${d.cantidadPresentacion} × ${d.presentacionPedida === 'CAJA' ? 'Caja' : 'Bulto'} x${d.unidadesPorPresentacion}`
        : null);

    const miniatura = (imagenes, tam) => (imagenes[0]?.url ? (
        <Box pos="relative" display="inline-block" style={{ flexShrink: 0 }}>
            <Box
                component="img"
                src={imagenes[0].url}
                alt="Producto"
                w={tam}
                h={tam}
                style={{ objectFit: 'cover', borderRadius: 6, cursor: 'pointer', display: 'block' }}
                onClick={() => setGaleriaModal({ imagenes, indice: 0 })}
                title="Haz clic para ver galería de imágenes"
            />
            {imagenes.length > 1 && (
                <Badge size="xs" variant="filled" color="dark" style={{ position: 'absolute', bottom: -4, right: -4, fontSize: 9, padding: '0 4px' }}>
                    {imagenes.length}
                </Badge>
            )}
        </Box>
    ) : (
        <Box w={tam} h={tam} bg="gray.1" style={{ borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #e9ecef' }}>
            <Text size="xs" c="dimmed">S/I</Text>
        </Box>
    ));

    const renglonTarjeta = { border: '1px solid #e9ecef', borderRadius: 10, background: '#fff' };
    const mostrarTabCuenta = (esCredito || cuentaPorCobrar || cobrableSinCuenta) && !esVendedor;
    const textoEntrega = pedido.tipoEntrega === 'sitio'
        ? 'Entregado en el momento (en sitio)'
        : (pedido.tipoEntrega === 'pickup' ? 'Cliente lo busca en tienda' : (esNacional ? 'Envío nacional (Zoom)' : 'Lo busca chofer / agencia'));

    const accionesDoc = [
        !pedido.aprobacionPendiente && (
            <Button key="imprimir" size="xs" color="navy.9" leftSection={<IconPrinter size={15} />} onClick={() => window.open(`/superuser/ventas/imprimir/${pedido.id}`, '_blank')}>
                Imprimir
            </Button>
        ),
        pedido.aprobacionPendiente && pedido.puedeAprobar && (
            <Button key="aprobar" size="xs" color="green" leftSection={<IconCheck size={15} />} loading={aprobando} onClick={aprobarFactura}>
                Aprobar factura
            </Button>
        ),
        rolUsuario === 'admin' && pedido.tipoDocumento === 'NOTA_ENTREGA' && pedido.condicionPago === 'Credito' && pedido.clienteId && !cancelado && pedido.revisionStock !== 'PENDIENTE' && (
            <Button key="pasar" size="xs" variant="light" color="indigo" leftSection={<IconReceiptTax size={15} />} onClick={() => setModalNotaAFactura(true)}>
                Pasar a factura
            </Button>
        ),
        rolUsuario === 'admin' && pedido.tipoDocumento === 'VENTA_RAPIDA' && pedido.clienteId && !cancelado && (
            <Button key="convertir" size="xs" variant="light" color="indigo" leftSection={<IconReceiptTax size={15} />} onClick={() => setModalFactura(true)}>
                Convertir en factura
            </Button>
        ),
        pedido.puedeCorregir && (
            <Button key="corregir" size="xs" variant="light" color="orange" leftSection={<IconEdit size={15} />} onClick={() => setModalCorregir(true)}>
                Corregir / eliminar
            </Button>
        ),
    ].filter(Boolean);

    const estadoRetencionResumen = !aplicaRetencionIva
        ? null
        : !retencion
            ? { color: 'gray', etiqueta: 'Sin retención aplicada', icono: IconReceiptTax }
            : retencion.estado === 'REGISTRADA'
                ? { color: 'teal', etiqueta: 'Retención aplicada', icono: IconFileCheck }
                : { color: 'orange', etiqueta: retencion.estado === 'POR_REVISAR' ? 'Retención por revisar' : 'Retención sin comprobante', icono: IconClock };

    return (
        <Box p={{ base: 'xs', sm: 'md' }} maw={1400} mx="auto">
            {/* =================== CABECERA DEL DOCUMENTO =================== */}
            <Paper withBorder radius="lg" p={{ base: 'sm', sm: 'md' }} mb="md" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                <Stack gap="sm">
                    <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                        <Group gap="xs" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                            <ActionIcon variant="light" color="gray" size="lg" radius="md" onClick={volver} aria-label="Volver a ventas">
                                <IconArrowLeft size={20} />
                            </ActionIcon>
                            <Box style={{ minWidth: 0 }}>
                                <Group gap="xs" wrap="wrap" align="center">
                                    <Title order={isMobile ? 4 : 3} c="navy.9" lh={1.2}>{tituloDoc}</Title>
                                    {pedido.numeroControl && (
                                        <Badge size="sm" variant="outline" color="gray">Control {pedido.numeroControl}</Badge>
                                    )}
                                    {pedido.numeroDocumentoAnterior && (
                                        <Badge size="sm" variant="light" color="gray">Antes: {pedido.numeroDocumentoAnterior}</Badge>
                                    )}
                                </Group>
                                <Text size="xs" c="dimmed" mt={2}>
                                    Emitida el {formatearFecha(pedido.fechaEmision || pedido.createdAt)} · {pedido.cliente?.nombre || 'Cliente eventual'}
                                    {pedido.cliente?.identificacion ? ` (${pedido.cliente.identificacion})` : ''}
                                </Text>
                            </Box>
                        </Group>

                        {accionesDoc.length > 0 && (
                            <Group gap="xs" wrap="wrap" w={isMobile ? '100%' : 'auto'}>
                                {accionesDoc}
                            </Group>
                        )}
                    </Group>

                    <Group gap={6} wrap="wrap">
                        <Badge size="sm" variant="filled" color={cancelado ? 'gray' : pagado ? 'teal' : 'orange'}>
                            Pago: {cancelado ? 'Anulado' : (pedido.statusPago || 'Pendiente')}
                        </Badge>
                        <Badge size="sm" variant="light" color={esCredito ? 'red' : 'teal'}>
                            {esCredito ? `Crédito${pedido.fechaVencimiento ? ` · vence ${formatearFecha(pedido.fechaVencimiento)}` : ''}` : 'Contado'}
                        </Badge>
                        <Badge size="sm" variant="light" color={cancelado ? 'red' : pedido.statusDespacho === 'Completado' ? 'blue' : 'yellow'}>
                            Despacho: {pedido.statusDespacho || 'Pendiente'}
                        </Badge>
                        <Badge size="sm" variant="outline" color={pedido.tipoEntrega === 'pickup' ? 'grape' : 'cyan'}>
                            {textoEntrega}
                        </Badge>
                        {estadoRetencionResumen && (
                            <Badge size="sm" variant={retencion ? 'filled' : 'light'} color={estadoRetencionResumen.color}>
                                {estadoRetencionResumen.etiqueta}
                            </Badge>
                        )}
                    </Group>
                </Stack>
            </Paper>

            {/* =================== ALERTAS PRIORITARIAS =================== */}
            {pedido.aprobacionPendiente && (
                <Alert color="orange" variant="light" radius="md" mb="md" icon={<IconClock size={18} />} title="Pendiente de aprobación">
                    Esta factura aún no se puede imprimir hasta que administración la revise y la apruebe.
                </Alert>
            )}

            {cancelado && (
                <Alert color="red" variant="light" radius="md" mb="md" icon={<IconAlertTriangle size={18} />} title="Documento anulado / cancelado">
                    <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                        <Text size="sm">Este pedido está cancelado: no se empaca, no se despacha ni admite abonos.</Text>
                        {reemplazos.length > 0 && (
                            <Group gap={6} wrap="wrap">
                                {reemplazos.map((f, i) => (
                                    <Button key={f.id} size="xs" variant="light" color="orange" onClick={() => router.push(`/superuser/ventas/${f.id}`)}>
                                        {i === 0 ? `Ver factura${reemplazos.length > 1 ? 's' : ''} ` : ''}{f.numero} →
                                    </Button>
                                ))}
                            </Group>
                        )}
                    </Group>
                </Alert>
            )}

            {!cancelado && empaqueNc?.bloqueaDespacho && (
                <Alert color="red" variant="light" radius="md" mb="md" icon={<IconAlertTriangle size={18} />} title="Caja empacada retenida por Nota de Crédito — NO despachar">
                    <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                        <Text size="sm">
                            {empaqueNc.esAnulacionTotal
                                ? 'Esta factura recibió una nota de crédito total después de empacarse. Desarma la caja antes de mover mercancía.'
                                : `Esta factura recibió una nota de crédito parcial que afecta la CxC (${(empaqueNc.cambios || []).filter((c) => c.sacar > 0).map((c) => `${c.nombre}: sacar ${c.sacar}`).join(', ')}).`}
                        </Text>
                        <Button size="xs" color="red" onClick={() => setModalGestionNc(true)}>
                            Gestionar ajuste de caja
                        </Button>
                    </Group>
                </Alert>
            )}

            {!cancelado && empaqueNc?.estadoEfectivo === 'DESARMADO' && (
                <Alert color="gray" variant="light" radius="md" mb="md" icon={<IconAlertTriangle size={18} />} title="Caja desarmada por Nota de Crédito">
                    <Text size="sm">
                        Este pedido salió de despacho porque la caja fue desarmada{empaqueNc.resolucion?.usuarioNombre ? ` por ${empaqueNc.resolucion.usuarioNombre}` : ''}{empaqueNc.resolucion?.fecha ? ` (${formatearFechaHora(empaqueNc.resolucion.fecha)})` : ''}.
                        {empaqueNc.resolucion?.nota ? ` Nota: ${empaqueNc.resolucion.nota}` : ''}
                    </Text>
                </Alert>
            )}

            {!cancelado && !pedido.empacadoAt && empaqueNc?.anuladaTotalParaEmpaque && (
                <Alert color="red" variant="light" radius="md" mb="md" icon={<IconAlertTriangle size={18} />} title="Factura anulada totalmente con Nota de Crédito">
                    <Text size="sm">Este pedido aún no se había empacado y salió automáticamente de «Pendientes por empacar».</Text>
                </Alert>
            )}

            {!cancelado && !pedido.empacadoAt && empaqueNc?.modificaEmpaque && (
                <Alert color="orange" variant="light" radius="md" mb="md" icon={<IconAlertTriangle size={18} />} title="Cantidades por empacar ajustadas por Nota de Crédito">
                    <Text size="sm">Las notas de crédito que afectaron la CxC redujeron las unidades que hay que empacar (las cantidades fiscales de la factura se conservan intactas).</Text>
                </Alert>
            )}

            {!cancelado && reemplazos.length > 0 && (
                <Alert color="orange" variant="light" radius="md" mb="md" title="Documento reemplazado">
                    <Group gap={6} wrap="wrap">
                        {reemplazos.map((f) => (
                            <Button key={f.id} size="xs" variant="light" color="orange" onClick={() => router.push(`/superuser/ventas/${f.id}`)}>
                                Ir a {f.numero} →
                            </Button>
                        ))}
                    </Group>
                </Alert>
            )}

            {/* =================== KPI SUMMARY STRIP (4 TARJETAS) =================== */}
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing={{ base: 'xs', sm: 'md' }} mb="md">
                <KpiCard
                    icono={IconCurrencyDollar}
                    color="blue"
                    titulo="Total documento"
                    valor={<PrecioVisual valor={pedido.totalFinal} simbolo={pedido.moneda} size={isMobile ? 'md' : 'xl'} fw={900} c="navy.9" />}
                    detalle={`≈ ${equivalente(pedido.totalFinal)} · tasa ${tasaDoc}`}
                />

                <KpiCard
                    icono={IconCash}
                    color={cancelado ? 'gray' : pagado ? 'teal' : 'orange'}
                    titulo={pagado ? 'Estado de pago' : 'Saldo pendiente'}
                    onClick={mostrarTabCuenta ? () => setTabActiva('cxc') : undefined}
                    valor={
                        cancelado ? (
                            <Text fz={isMobile ? 'md' : 'xl'} fw={900} c="dimmed">Anulado</Text>
                        ) : pagado ? (
                            <Text fz={isMobile ? 'md' : 'xl'} fw={900} c="teal.7">Pagado</Text>
                        ) : (
                            <PrecioVisual valor={saldoCuenta} simbolo={monedaCuenta} size={isMobile ? 'md' : 'xl'} fw={900} c="red.7" />
                        )
                    }
                    detalle={
                        cancelado ? 'Sin cobro'
                            : pagado ? (esCredito ? 'Factura a crédito saldada' : 'Pagado de contado')
                                : (cuentaPorCobrar?.fechaVencimiento ? `Vence ${formatearFecha(cuentaPorCobrar.fechaVencimiento)}` : (esCredito ? 'A crédito' : 'Pendiente de cobro'))
                    }
                    accion={
                        !esVendedor && !pagado && !cancelado && (cuentaPorCobrar || cobrableSinCuenta) ? (
                            <Button
                                size="compact-xs"
                                color="teal"
                                variant="light"
                                fullWidth
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!cuentaPorCobrar && pedido.tipoVenta === 'ONLINE') {
                                        setCobroTienda({ metodoPago: 'Efectivo ($)', referencia: '' });
                                        setModalCobroTienda(true);
                                    } else {
                                        abrirAbono();
                                    }
                                }}
                            >
                                {!cuentaPorCobrar && pedido.tipoVenta === 'ONLINE' ? 'Cobrar en tienda' : 'Registrar abono'}
                            </Button>
                        ) : null
                    }
                />

                {aplicaRetencionIva ? (
                    <KpiCard
                        icono={estadoRetencionResumen.icono}
                        color={estadoRetencionResumen.color}
                        titulo="Retención IVA"
                        valor={
                            retencion ? (
                                <Text fz={isMobile ? 'sm' : 'lg'} fw={900} c={retencion.estado === 'REGISTRADA' ? 'teal.7' : 'orange.8'}>
                                    Bs {fmtBsNum(retencion.ivaRetenido)}
                                </Text>
                            ) : (
                                <Text fz={isMobile ? 'sm' : 'lg'} fw={800} c="dimmed">Sin retención</Text>
                            )
                        }
                        detalle={
                            retencion?.estado === 'REGISTRADA'
                                ? `Aplicada · Comp. ${retencion.comprobante}`
                                : retencion
                                    ? 'Aplicada · falta comprobante'
                                    : `75 % del IVA = Bs ${fmtBsNum(retEsperadaBs)}`
                        }
                    />
                ) : (
                    <KpiCard
                        icono={IconReceiptTax}
                        color="indigo"
                        titulo="Documento"
                        valor={<Text fz={isMobile ? 'sm' : 'lg'} fw={800} c="navy.9">{pedido.tipoDocumento === 'NOTA_ENTREGA' ? 'Nota de entrega' : pedido.tipoDocumento === 'FACTURA' ? 'Factura exenta' : 'Recibo'}</Text>}
                        detalle={pedido.tipoDocumento === 'NOTA_ENTREGA' ? 'No fiscal (sin IVA)' : 'Sin IVA gravado'}
                    />
                )}

                <KpiCard
                    icono={IconTruck}
                    color={cancelado ? 'red' : pedido.statusDespacho === 'Completado' ? 'blue' : 'yellow'}
                    titulo="Despacho"
                    onClick={() => setTabActiva('logistica')}
                    valor={
                        <Text fz={isMobile ? 'sm' : 'lg'} fw={900} c={cancelado ? 'red.7' : pedido.statusDespacho === 'Completado' ? 'blue.8' : 'yellow.9'}>
                            {pedido.statusDespacho || 'Pendiente'}
                        </Text>
                    }
                    detalle={textoEntrega}
                />
            </SimpleGrid>

            {/* =================== PESTAÑAS DEL DASHBOARD =================== */}
            <Tabs value={tabActiva} onChange={setTabActiva} color="navy.9" variant="pills" radius="xl">
                <Paper withBorder radius="xl" p={4} mb="md" w={isMobile ? '100%' : 'fit-content'} maw="100%" style={{ overflowX: 'auto' }}>
                    <Tabs.List style={{ flexWrap: 'nowrap' }} grow={isMobile}>
                        <Tabs.Tab value="resumen" px={isMobile ? 'xs' : 'md'} leftSection={isMobile ? null : <IconReceiptTax size={16} />}>
                            Resumen
                        </Tabs.Tab>
                        <Tabs.Tab value="logistica" px={isMobile ? 'xs' : 'md'} leftSection={isMobile ? null : <IconPackage size={16} />}>
                            Logística
                        </Tabs.Tab>
                        {mostrarTabCuenta && (
                            <Tabs.Tab value="cxc" px={isMobile ? 'xs' : 'md'} leftSection={isMobile ? null : <IconCash size={16} />}>
                                {isMobile ? 'Cuenta' : `Estado de cuenta${abonosOrdenados.length ? ` (${abonosOrdenados.length})` : ''}`}
                            </Tabs.Tab>
                        )}
                        {!esVendedor && (
                            <Tabs.Tab value="finanzas" px={isMobile ? 'xs' : 'md'} leftSection={isMobile ? null : <IconReportMoney size={16} />}>
                                {isMobile ? 'Caja' : `Movimientos${pedido.movimientos?.length ? ` (${pedido.movimientos.length})` : ''}`}
                            </Tabs.Tab>
                        )}
                    </Tabs.List>
                </Paper>

                {/* ============================================================== */}
                {/* PESTAÑA 1: RESUMEN, PRODUCTOS, CLIENTE Y RETENCIÓN */}
                {/* ============================================================== */}
                <Tabs.Panel value="resumen">
                    <Grid gutter="md">
                        <Grid.Col span={{ base: 12, lg: 8 }}>
                            <Stack gap="md">
                                {!esVendedor && <RevisionExistencias pedido={pedido} onCambio={() => refetch()} />}
                                {!esVendedor && <PagoPorVerificarCard pedido={pedido} esAdmin={rolUsuario === 'admin'} onCambio={refetch} />}

                                <Paper withBorder p={{ base: 'sm', sm: 'md' }} radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                    <Group justify="space-between" align="center" mb="sm">
                                        <Title order={5} c="navy.9">Productos ({pedido.detalles?.length || 0})</Title>
                                        <Badge variant="light" color="gray">{pedido.moneda === 'BS' ? 'Bolívares (Bs)' : 'Dólares (USD)'}</Badge>
                                    </Group>

                                    {isMobile ? (
                                        <Stack gap="xs">
                                            {pedido.detalles?.map((d) => {
                                                const pres = presentacionRenglon(d);
                                                const ncDet = ncPorDetalle.get(d.id);
                                                return (
                                                    <Group key={d.id} wrap="nowrap" align="flex-start" gap="sm" p="xs" style={renglonTarjeta}>
                                                        {miniatura(obtenerTodasLasImagenes(d.producto), 46)}
                                                        <Box style={{ flex: 1, minWidth: 0 }}>
                                                            <Text size="sm" fw={600} lh={1.25} lineClamp={2}>{nombreRenglon(d)}</Text>
                                                            <Text size="xs" c="dimmed" lineClamp={1}>
                                                                {d.producto?.codigo || 'S/C'} · {d.producto?.marca?.nombre || 'Genérica'}
                                                            </Text>
                                                            <Group justify="space-between" align="flex-end" wrap="nowrap" mt={6} gap="xs">
                                                                <Box style={{ minWidth: 0 }}>
                                                                    <Text size="xs">
                                                                        <b>{d.cantidad}</b> × <PrecioVisual valor={d.precioUnitario} simbolo={pedido.moneda} size="xs" fw={600} />
                                                                    </Text>
                                                                    {pres && <Text size="xs" c="dimmed">{pres}</Text>}
                                                                    {ncDet && ncDet.acreditadoCxc > 0 && (
                                                                        <Badge size="xs" mt={2} color={ncDet.restante === 0 ? 'red' : 'orange'} variant="light">
                                                                            {ncDet.restante === 0 ? `NC -${ncDet.acreditadoCxc} (retirado)` : `NC -${ncDet.acreditadoCxc} → empacar ${ncDet.restante}`}
                                                                        </Badge>
                                                                    )}
                                                                </Box>
                                                                <Box ta="right" style={{ flexShrink: 0 }}>
                                                                    <PrecioVisual valor={d.subtotal ?? d.precioUnitario * d.cantidad} simbolo={pedido.moneda} size="sm" fw={800} c="navy.9" />
                                                                    {!d.aplicaIva && pedido.tipoDocumento === 'FACTURA' && <Text size="xs" c="dimmed">Exento</Text>}
                                                                </Box>
                                                            </Group>
                                                        </Box>
                                                    </Group>
                                                );
                                            })}
                                        </Stack>
                                    ) : (
                                        <Table.ScrollContainer minWidth={600}>
                                            <Table striped highlightOnHover verticalSpacing="sm">
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th>Img</Table.Th>
                                                        <Table.Th>Código</Table.Th>
                                                        <Table.Th>Producto / Marca</Table.Th>
                                                        <Table.Th ta="center">Cant.</Table.Th>
                                                        <Table.Th ta="right">Precio unit.</Table.Th>
                                                        <Table.Th ta="right">Subtotal</Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {pedido.detalles?.map((d) => {
                                                        const nombreMarca = d.producto?.marca?.nombre || 'Genérica';
                                                        const pres = presentacionRenglon(d);
                                                        const ncDet = ncPorDetalle.get(d.id);
                                                        return (
                                                            <Table.Tr key={d.id}>
                                                                <Table.Td>{miniatura(obtenerTodasLasImagenes(d.producto), 40)}</Table.Td>
                                                                <Table.Td><Text size="xs" ff="monospace">{d.producto?.codigo || 'N/A'}</Text></Table.Td>
                                                                <Table.Td>
                                                                    <Stack gap={2}>
                                                                        <Text size="sm" fw={600}>{nombreRenglon(d)}</Text>
                                                                        <Badge size="xs" variant="light" color="blue" w="fit-content">{nombreMarca}</Badge>
                                                                    </Stack>
                                                                </Table.Td>
                                                                <Table.Td ta="center">
                                                                    <Text fw={800}>{d.cantidad}</Text>
                                                                    {pres && <Text size="xs" c="dimmed">{pres}</Text>}
                                                                    {ncDet && ncDet.acreditadoCxc > 0 && (
                                                                        <Badge size="xs" mt={2} color={ncDet.restante === 0 ? 'red' : 'orange'} variant="light">
                                                                            {ncDet.restante === 0 ? `NC -${ncDet.acreditadoCxc} (retirado)` : `NC -${ncDet.acreditadoCxc} → empacar ${ncDet.restante}`}
                                                                        </Badge>
                                                                    )}
                                                                </Table.Td>
                                                                <Table.Td ta="right"><PrecioVisual valor={d.precioUnitario} simbolo={pedido.moneda} size="sm" /></Table.Td>
                                                                <Table.Td ta="right">
                                                                    <PrecioVisual valor={d.subtotal ?? d.precioUnitario * d.cantidad} simbolo={pedido.moneda} size="sm" fw={700} />
                                                                    {!d.aplicaIva && pedido.tipoDocumento === 'FACTURA' && <Text size="xs" c="dimmed">(Exento)</Text>}
                                                                </Table.Td>
                                                            </Table.Tr>
                                                        );
                                                    })}
                                                </Table.Tbody>
                                            </Table>
                                        </Table.ScrollContainer>
                                    )}

                                    {/* Totales del documento */}
                                    <Paper withBorder radius="md" p="sm" mt="md" ml="auto" maw={isMobile ? undefined : 380} bg="gray.0">
                                        <Stack gap={6}>
                                            {pedido.tipoDocumento === 'NOTA_ENTREGA' ? (() => {
                                                const ivaRef = Math.round((pedido.detalles || []).reduce((a, d) => a + Number(d.subtotal) * (d.isFicticio ? (d.aplicaIva ? 16 : 0) : Number(d.producto?.porcentajeIva ?? 16)) / 100, 0) * 100) / 100;
                                                return (
                                                    <>
                                                        <Group justify="space-between"><Text size="sm" c="dimmed">Base imponible</Text><PrecioVisual valor={pedido.subtotal} simbolo={pedido.moneda} size="sm" fw={600} /></Group>
                                                        <Group justify="space-between"><Text size="sm" c="dimmed">IVA 16 % (referencial)</Text><PrecioVisual valor={ivaRef} simbolo={pedido.moneda} size="sm" fw={600} /></Group>
                                                        <Divider />
                                                        <Group justify="space-between"><Text fw={800}>Total con IVA</Text><PrecioVisual valor={Number(pedido.totalFinal) + ivaRef} simbolo={pedido.moneda} size="lg" fw={900} c="navy.9" /></Group>
                                                        <Text size="xs" c="dimmed" ta="right">≈ {equivalente(Number(pedido.totalFinal) + ivaRef)} · tasa {tasaDoc} Bs/$</Text>
                                                        <Text size="xs" c="orange.8" ta="right">Documento no fiscal: el monto a cobrar es {pedido.moneda === 'BS' ? 'Bs ' : '$'}{Number(pedido.totalFinal).toFixed(2)}.</Text>
                                                    </>
                                                );
                                            })() : (() => {
                                                const g = desgloseFactura(pedido);
                                                const fila = (rotulo, valor, o = {}) => (
                                                    <Group justify="space-between" align="flex-start" wrap="nowrap" key={rotulo}>
                                                        <Text size={o.fuerte ? 'md' : 'sm'} fw={o.fuerte ? 800 : 500} c={o.c || (o.fuerte ? 'navy.9' : 'dimmed')}>{rotulo}</Text>
                                                        <Box ta="right">
                                                            <PrecioVisual valor={valor} simbolo={pedido.moneda} size={o.fuerte ? 'lg' : 'sm'} fw={o.fuerte ? 900 : 600} c={o.fuerte ? 'navy.9' : undefined} />
                                                            <Text size="xs" c="dimmed" lh={1.1}>≈ {equivalente(valor)}</Text>
                                                        </Box>
                                                    </Group>
                                                );
                                                return (
                                                    <>
                                                        {fila('Subtotal', g.subtotal)}
                                                        {g.exento > 0.004 && fila('Monto exento (sin IVA)', g.exento, { c: 'yellow.9' })}
                                                        {g.exento > 0.004 && fila('Base gravable', g.gravable)}
                                                        {g.conIva && fila('IVA 16 %', g.iva)}
                                                        {g.flete > 0.004 && fila(pedido.tipoVenta === 'ONLINE' ? 'Delivery' : 'Flete', g.flete)}
                                                        <Divider />
                                                        {fila('Total', g.total, { fuerte: true })}
                                                        <Text size="xs" c="dimmed" ta="right">Tasa del día: {tasaDoc} Bs/$ · en {pedido.moneda === 'BS' ? 'bolívares' : 'dólares'}</Text>
                                                    </>
                                                );
                                            })()}
                                        </Stack>
                                    </Paper>
                                </Paper>
                            </Stack>
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, lg: 4 }}>
                            <Stack gap="md">
                                {/* Cliente */}
                                <Paper withBorder p="md" radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                    <Group gap="xs" mb="xs">
                                        <ThemeIcon variant="light" color="blue" size="md" radius="md">
                                            <IconUser size={18} />
                                        </ThemeIcon>
                                        <Text fw={800} size="sm" c="navy.9">Cliente</Text>
                                    </Group>
                                    <Text size="sm" fw={700} c="dark.8">{pedido.cliente?.nombre || 'Cliente eventual'}</Text>
                                    {pedido.cliente?.identificacion && <Text size="xs" c="dimmed" mt={2}>RIF / C.I.: {pedido.cliente.identificacion}</Text>}
                                    {pedido.cliente?.direccion && <Text size="xs" c="dimmed" mt={4}>{pedido.cliente.direccion}</Text>}
                                </Paper>

                                {/* Retención de IVA y N° de control */}
                                {!esVendedor && <RetencionIvaCard pedido={pedido} onCambio={refetch} />}

                                {/* Notas de crédito / débito */}
                                <NotasFacturaCard pedido={pedido} onCambio={refetch} />
                            </Stack>
                        </Grid.Col>
                    </Grid>
                </Tabs.Panel>

                {/* ============================================================== */}
                {/* PESTAÑA 2: LOGÍSTICA, EMPAQUE, PERSONAL Y ENTREGA */}
                {/* ============================================================== */}
                <Tabs.Panel value="logistica">
                    <Stack gap="md">
                        <Paper withBorder p={{ base: 'md', sm: 'xl' }} radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                            {cancelado ? (
                                <Text ta="center" fw={700} c="red.7">Este pedido está cancelado: no se empaca ni se despacha.</Text>
                            ) : (
                                <Stepper active={pasoActual} color="blue" size={isMobile ? 'sm' : 'md'} orientation={isMobile ? 'vertical' : 'horizontal'}>
                                    <Stepper.Step label="Generado" description="Documento emitido" icon={<IconReceiptTax size={18} />} />
                                    <Stepper.Step label="Empacado" description="Caja armada" icon={<IconPackage size={18} />} />
                                    <Stepper.Step label={pedido.tipoEntrega === 'pickup' ? 'Retirado' : 'Despachado'} description={pedido.tipoEntrega === 'pickup' ? 'Entregado en tienda' : 'Entregado al transporte'} icon={<IconTruck size={18} />} />
                                </Stepper>
                            )}

                            {pedido.empacadorId && (
                                <Group mt="lg" gap="xs" justify="center" wrap="wrap">
                                    <Badge size="md" variant={pedido.empacadoAt ? 'filled' : 'light'} color={pedido.empacadoAt ? 'teal' : 'gray'}>
                                        {pedido.empacadoAt ? `Empaque firmado · ${formatearFechaHora(pedido.empacadoAt)}` : 'Empaque pendiente de firma'}
                                    </Badge>
                                    <Badge size="md" variant={pedido.etiquetadoAt ? 'filled' : 'light'} color={pedido.etiquetadoAt ? 'teal' : 'gray'}>
                                        {pedido.etiquetadoAt ? `Etiquetado firmado · ${formatearFechaHora(pedido.etiquetadoAt)}` : 'Etiquetado pendiente de firma'}
                                    </Badge>
                                </Group>
                            )}

                            <Group mt={isMobile ? 'md' : 'xl'} justify="center" gap="sm" wrap="wrap">
                                {soyEmpacador && !pedido.empacadoAt && !cancelado && !empaqueAnulado && (
                                    <Button size="md" fullWidth={isMobile} color="blue" loading={isSubmitting} leftSection={<IconPackage size={18} />} onClick={() => router.push(`/superuser/ventas/${params.id}/empacar`)}>
                                        Empacar paso a paso
                                    </Button>
                                )}
                                {soyEtiquetador && !pedido.etiquetadoAt && !cancelado && !empaqueAnulado && (
                                    <Button size="md" fullWidth={isMobile} color="grape" loading={isSubmitting} disabled={!pedido.empacadoAt} leftSection={<IconPackage size={18} />} onClick={() => handleFirmar('FIRMAR_ETIQUETADO', 'Etiquetado firmado.')}>
                                        {pedido.empacadoAt ? 'Firmar etiquetado' : 'Etiquetado (esperando empaque)'}
                                    </Button>
                                )}
                                {!esVendedor && !pedido.empacadoAt && !['Completado', 'Cancelado'].includes(pedido.statusDespacho) && !empaqueAnulado && (
                                    <Button
                                        size="md"
                                        fullWidth={isMobile}
                                        color="blue"
                                        variant={pedido.empacadorId ? 'light' : 'filled'}
                                        leftSection={<IconPackage size={18} />}
                                        onClick={() => {
                                            formEmpacar.setValues({
                                                empacadorId: pedido.empacadorId ? String(pedido.empacadorId) : '',
                                                etiquetadorId: pedido.etiquetadorId ? String(pedido.etiquetadorId) : '',
                                            });
                                            setModalEmpacar(true);
                                        }}
                                    >
                                        {pedido.empacadorId ? 'Cambiar personal asignado' : 'Asignar personal'}
                                    </Button>
                                )}
                                {pasoActual === 1 && empaqueNc?.bloqueaDespacho && (
                                    <Button size="md" fullWidth={isMobile} color="red" leftSection={<IconAlertTriangle size={18} />} onClick={() => setModalGestionNc(true)}>
                                        Gestionar ajuste de caja por NC
                                    </Button>
                                )}
                                {pasoActual === 1 && !empaqueNc?.bloqueaDespacho && !empaqueAnulado && (!esVendedor || soyEmpacador || soyEtiquetador || soyVendedorPedido) && (
                                    pedido.tipoEntrega === 'pickup' ? (
                                        <Button
                                            size="md"
                                            fullWidth={isMobile}
                                            color="teal.7"
                                            loading={isSubmitting}
                                            leftSection={<IconCheck size={18} />}
                                            onClick={() => handleAction('DESPACHAR', { quienRetira: 'Retirado por el cliente en tienda', costoFlete: 0 }, null, 'Pedido marcado como despachado.')}
                                        >
                                            Marcar como despachado (cliente retiró)
                                        </Button>
                                    ) : (
                                        <Button
                                            size="md"
                                            fullWidth={isMobile}
                                            color="grape"
                                            leftSection={<IconTruck size={18} />}
                                            onClick={() => { formDespacho.setFieldValue('quienRetira', pedido.quienRetira || ''); setModalDespacho(true); }}
                                        >
                                            Entregar al chofer / Registrar despacho
                                        </Button>
                                    )
                                )}
                            </Group>
                            {empaqueNc?.resolucion && (
                                <Alert mt="md" color={empaqueNc.estadoEfectivo === 'DESARMADO' ? 'gray' : 'teal'} variant="light" title={`Ajuste logístico por NC (${empaqueNc.resolucion.estado || 'REEMPACAR'})`}>
                                    <Text size="xs">
                                        {empaqueNc.resolucion.usuarioNombre ? `Por ${empaqueNc.resolucion.usuarioNombre}` : 'Registrado'}
                                        {empaqueNc.resolucion.fecha ? ` · ${formatearFechaHora(empaqueNc.resolucion.fecha)}` : ''}
                                        {empaqueNc.resolucion.nota ? ` — ${empaqueNc.resolucion.nota}` : ''}
                                    </Text>
                                </Alert>
                            )}
                        </Paper>

                        <EvidenciaEmpaque ventaId={pedido.id} puedeLiberar={!esVendedor} />

                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                            {/* Personal involucrado */}
                            <Paper withBorder p="md" radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                <Group gap="xs" mb="sm">
                                    <ThemeIcon variant="light" color="indigo" size="md" radius="md">
                                        <IconUsers size={18} />
                                    </ThemeIcon>
                                    <Text fw={800} size="sm" c="navy.9">Personal involucrado</Text>
                                </Group>
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="xs" c="dimmed">Vendedor / Registrador</Text>
                                        <Text size="sm" fw={600}>{pedido.vendedor?.empleado ? `${pedido.vendedor.empleado.nombre} ${pedido.vendedor.empleado.apellido}` : 'Sistema'}</Text>
                                    </Group>
                                    {pedido.vendedorExterno && (
                                        <Group justify="space-between">
                                            <Text size="xs" c="dimmed">Vendedor externo (comisión)</Text>
                                            <Text size="sm" fw={600} c="grape.8">{pedido.vendedorExterno.nombre} · {pedido.vendedorExterno.porcentaje} %</Text>
                                        </Group>
                                    )}
                                    <Group justify="space-between">
                                        <Text size="xs" c="dimmed">Empacador</Text>
                                        <Text size="sm" fw={600}>{pedido.empacador?.empleado ? `${pedido.empacador.empleado.nombre} ${pedido.empacador.empleado.apellido}` : 'Pendiente'}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="xs" c="dimmed">Etiquetador</Text>
                                        <Text size="sm" fw={600}>{pedido.etiquetador?.empleado ? `${pedido.etiquetador.empleado.nombre} ${pedido.etiquetador.empleado.apellido}` : 'Pendiente'}</Text>
                                    </Group>
                                </Stack>
                            </Paper>

                            {/* Logística de entrega */}
                            <Paper withBorder p="md" radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                <Group gap="xs" mb="sm">
                                    <ThemeIcon variant="light" color="cyan" size="md" radius="md">
                                        <IconMapPin size={18} />
                                    </ThemeIcon>
                                    <Text fw={800} size="sm" c="navy.9">Logística de entrega</Text>
                                </Group>

                                {pedido.tipoEntrega === 'pickup' ? (
                                    <Box>
                                        <Badge color="grape" variant="light" mb="xs">Retiro en tienda (Pickup)</Badge>
                                        <Text size="xs" c="dimmed">El cliente retira directamente en el establecimiento. No aplica costo de flete ni agencia de envíos.</Text>
                                    </Box>
                                ) : esNacional ? (
                                    <Box>
                                        <Badge color="indigo" variant="light" mb="xs">Envío nacional por Zoom</Badge>
                                        <Text size="xs" c="dimmed">Cobro a destino: el cliente paga el flete a Zoom al recibir.</Text>
                                        {pedido.direccionEntrega && <Text size="sm" fw={600} mt={6}>{pedido.direccionEntrega}</Text>}
                                        {pedido.quienRetira && <Text size="sm" fw={600} mt={4}>Guía: {pedido.quienRetira}</Text>}
                                    </Box>
                                ) : (
                                    <Stack gap={6}>
                                        <Badge color="cyan" variant="light" w="fit-content">Envío por Delivery / Agencia</Badge>
                                        <Box>
                                            <Text size="xs" c="dimmed">Quién retira / Agencia</Text>
                                            <Text size="sm" fw={600}>{pedido.quienRetira || 'Pendiente de asignar agencia'}</Text>
                                        </Box>
                                        {pedido.direccionEntrega && (() => {
                                            const g = /GPS: (-?[0-9.]+), (-?[0-9.]+)/.exec(pedido.direccionEntrega);
                                            return (
                                                <Box>
                                                    <Text size="xs" c="dimmed">Dirección de entrega</Text>
                                                    <Text size="sm" fw={600}>{pedido.direccionEntrega}</Text>
                                                    {g && <Button component="a" href={`https://www.google.com/maps?q=${g[1]},${g[2]}`} target="_blank" rel="noreferrer" size="compact-xs" variant="light" mt={4}>Ver en Google Maps</Button>}
                                                </Box>
                                            );
                                        })()}
                                        <Group justify="space-between">
                                            <Text size="xs" c="dimmed">{pedido.tipoVenta === 'ONLINE' ? 'Delivery cobrado al cliente' : 'Costo de flete'}</Text>
                                            <PrecioVisual valor={pedido.costoFlete || 0} simbolo={pedido.moneda} size="sm" fw={700} />
                                        </Group>
                                        {pedido.tipoVenta === 'ONLINE' && pedido.costoFleteReal !== null && pedido.costoFleteReal !== undefined && (() => {
                                            const dif = Math.round((Number(pedido.costoFlete) - Number(pedido.costoFleteReal)) * 100) / 100;
                                            return (
                                                <Box>
                                                    <Group justify="space-between">
                                                        <Text size="xs" c="dimmed">Lo que cobró el delivery</Text>
                                                        <PrecioVisual valor={pedido.costoFleteReal} simbolo={pedido.moneda} size="sm" fw={700} />
                                                    </Group>
                                                    <Badge mt={4} size="sm" variant="light" color={dif === 0 ? 'teal' : (dif > 0 ? 'blue' : 'red')}>
                                                        {dif === 0 ? 'Cálculo exacto' : (dif > 0 ? `Cobrado de más: ${dif.toFixed(2)}` : `Cobrado de menos: ${Math.abs(dif).toFixed(2)}`)}
                                                    </Badge>
                                                </Box>
                                            );
                                        })()}
                                    </Stack>
                                )}
                            </Paper>

                            {!esNacional && <EnvioCard pedido={pedido} soloAgencia={esVendedor} onCambio={refetch} />}
                            <EntregaChoferCard pedido={pedido} />
                        </SimpleGrid>
                    </Stack>
                </Tabs.Panel>

                {/* ============================================================== */}
                {/* PESTAÑA 3: ESTADO DE CUENTA Y ABONOS */}
                {/* ============================================================== */}
                {mostrarTabCuenta && (
                    <Tabs.Panel value="cxc">
                        <Grid gutter="md">
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Paper withBorder p="md" radius="lg" bg={saldoCuenta > 0 ? 'orange.0' : 'teal.0'} style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                    <Text fw={800} size="md" mb="sm" c="navy.9">Estado de cuenta</Text>
                                    {!cuentaPorCobrar && cobrableSinCuenta ? (
                                        <>
                                            <Text size="sm" mb="xs">{pedido.tipoVenta === 'ONLINE' ? 'Compra de la tienda reservada para pagar en el local.' : 'Pedido de contado pendiente de cobro.'}</Text>
                                            <Group justify="space-between" mb="md">
                                                <Text size="md" fw={700}>Por cobrar:</Text>
                                                <PrecioVisual valor={saldoCuenta} simbolo={pedido.moneda} size="xl" fw={900} c="red.7" />
                                            </Group>
                                            {pedido.tipoVenta === 'ONLINE' ? (
                                                <Button fullWidth color="teal" leftSection={<IconCash size={18} />} onClick={() => { setCobroTienda({ metodoPago: 'Efectivo ($)', referencia: '' }); setModalCobroTienda(true); }}>
                                                    Registrar cobro en tienda
                                                </Button>
                                            ) : (
                                                <Button fullWidth color="teal" leftSection={<IconCash size={18} />} onClick={abrirAbono}>
                                                    Registrar pago
                                                </Button>
                                            )}
                                        </>
                                    ) : !cuentaPorCobrar ? (
                                        <Text size="sm" c="dimmed">Este pedido no tiene una cuenta por cobrar activa.</Text>
                                    ) : (
                                        <>
                                            <Group justify="space-between" mb={8}>
                                                <Text size="sm">Monto de la deuda</Text>
                                                <PrecioVisual valor={cuentaPorCobrar.montoTotal} simbolo={monedaCuenta} size="md" fw={600} />
                                            </Group>
                                            <Group justify="space-between" mb={8}>
                                                <Text size="sm">Abonado (incluye retención)</Text>
                                                <PrecioVisual valor={Math.max(0, Number(cuentaPorCobrar.montoTotal) - saldoCuenta)} simbolo={monedaCuenta} size="md" fw={600} c="teal.8" />
                                            </Group>
                                            <Group justify="space-between" mb={8}>
                                                <Text size="sm">Vencimiento</Text>
                                                <Text size="sm" fw={600}>{formatearFecha(cuentaPorCobrar.fechaVencimiento) || '—'}</Text>
                                            </Group>
                                            <Divider my="sm" />
                                            <Group justify="space-between" mb="md">
                                                <Text size="md" fw={800}>Saldo pendiente</Text>
                                                <PrecioVisual valor={saldoCuenta} simbolo={monedaCuenta} size="xl" fw={900} c={saldoCuenta > 0 ? 'red.7' : 'teal.8'} />
                                            </Group>
                                            {saldoCuenta > 0 && precioBCV > 0 && (
                                                <Text size="xs" c="dimmed" ta="right" mt={-10} mb="sm">
                                                    ≈ {monedaCuenta === 'USD' ? `Bs ${fmtBsNum(aBolivares(saldoCuenta, precioBCV))}` : `$${aDolares(saldoCuenta, precioBCV).toFixed(2)}`} a la tasa de hoy
                                                </Text>
                                            )}
                                            <Button fullWidth color="teal" disabled={saldoCuenta <= 0 || cancelado} onClick={abrirAbono} leftSection={<IconCash size={18} />}>
                                                {saldoCuenta > 0 ? 'Registrar abono' : 'Cuenta pagada'}
                                            </Button>
                                        </>
                                    )}
                                </Paper>
                            </Grid.Col>

                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <Paper withBorder p={{ base: 'sm', sm: 'md' }} radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                    <Text fw={800} mb="sm" c="navy.9">Historial de abonos y retenciones</Text>
                                    {isMobile ? (
                                        !abonosOrdenados.length ? <Text size="sm" c="dimmed" ta="center" py="md">No hay abonos registrados.</Text> : (
                                            <Stack gap="xs">
                                                {abonosOrdenados.map((abono) => (
                                                    <Group key={abono.id} justify="space-between" wrap="nowrap" gap="xs" p="xs" style={renglonTarjeta}>
                                                        <Box style={{ minWidth: 0 }}>
                                                            <Text size="sm" fw={700}>{formatearFecha(abono.fechaPago)}</Text>
                                                            {abono.metodoPago === 'Retención IVA'
                                                                ? <Badge size="sm" variant="light" color="grape">Retención IVA</Badge>
                                                                : <Text size="xs">{abono.metodoPago}</Text>}
                                                            <Text size="xs" c="dimmed" lineClamp={1}>Ref.: {abono.referencia || 'S/N'}</Text>
                                                        </Box>
                                                        <Box ta="right" style={{ flexShrink: 0 }}>
                                                            <PrecioVisual valor={abono.montoUsd} simbolo="$" size="sm" fw={800} c="teal.7" />
                                                            <Box><PrecioVisual valor={abono.montoVes} simbolo="Bs" size="xs" fw={600} c="dimmed" /></Box>
                                                        </Box>
                                                    </Group>
                                                ))}
                                            </Stack>
                                        )
                                    ) : (
                                        <Table.ScrollContainer minWidth={540}>
                                            <Table striped highlightOnHover>
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th>Fecha</Table.Th>
                                                        <Table.Th>Método</Table.Th>
                                                        <Table.Th>Referencia</Table.Th>
                                                        <Table.Th ta="right">Monto ($)</Table.Th>
                                                        <Table.Th ta="right">Monto (Bs)</Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {!abonosOrdenados.length ? (
                                                        <Table.Tr><Table.Td colSpan={5} ta="center" c="dimmed">No hay abonos registrados.</Table.Td></Table.Tr>
                                                    ) : (
                                                        abonosOrdenados.map((abono) => (
                                                            <Table.Tr key={abono.id}>
                                                                <Table.Td>{formatearFecha(abono.fechaPago)}</Table.Td>
                                                                <Table.Td>{abono.metodoPago === 'Retención IVA' ? <Badge size="sm" variant="light" color="grape">Retención IVA</Badge> : abono.metodoPago}</Table.Td>
                                                                <Table.Td>{abono.referencia || 'S/N'}</Table.Td>
                                                                <Table.Td ta="right"><PrecioVisual valor={abono.montoUsd} simbolo="$" size="sm" fw={700} c="teal.7" /></Table.Td>
                                                                <Table.Td ta="right"><PrecioVisual valor={abono.montoVes} simbolo="Bs" size="sm" fw={600} c="dimmed" /></Table.Td>
                                                            </Table.Tr>
                                                        ))
                                                    )}
                                                </Table.Tbody>
                                            </Table>
                                        </Table.ScrollContainer>
                                    )}
                                </Paper>
                            </Grid.Col>
                        </Grid>
                    </Tabs.Panel>
                )}

                {/* ============================================================== */}
                {/* PESTAÑA 4: MOVIMIENTOS DE CAJA */}
                {/* ============================================================== */}
                {!esVendedor && (
                    <Tabs.Panel value="finanzas">
                        <Paper withBorder p={{ base: 'sm', sm: 'md' }} radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                            <Text fw={800} mb="sm" c="navy.9">Movimientos de caja de este documento</Text>
                            {isMobile ? (
                                !pedido.movimientos?.length ? <Text size="sm" c="dimmed" ta="center" py="md">No hay movimientos financieros.</Text> : (
                                    <Stack gap="xs">
                                        {pedido.movimientos.map((mov) => (
                                            <Box key={mov.id} p="xs" style={renglonTarjeta}>
                                                <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                                                    <Group gap={6} wrap="nowrap">
                                                        <Badge color={mov.tipo === 'INGRESO' ? 'teal' : 'red'} variant="light">{mov.tipo}</Badge>
                                                        <Text size="xs" c="dimmed">{formatearFecha(mov.fecha)}</Text>
                                                    </Group>
                                                    <Box ta="right" style={{ flexShrink: 0 }}>
                                                        <PrecioVisual valor={mov.montoUsd} simbolo="$" size="sm" c={mov.tipo === 'INGRESO' ? 'teal.7' : 'red.7'} fw={800} />
                                                        <Box><PrecioVisual valor={mov.montoVes} simbolo="Bs" size="xs" c="dimmed" fw={600} /></Box>
                                                    </Box>
                                                </Group>
                                                <Text size="sm" mt={4} lh={1.3}>{mov.descripcion}</Text>
                                                {mov.metodoPago && <Text size="xs" c="dimmed">{mov.metodoPago}</Text>}
                                            </Box>
                                        ))}
                                    </Stack>
                                )
                            ) : (
                                <Table.ScrollContainer minWidth={680}>
                                    <Table striped highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Fecha</Table.Th>
                                                <Table.Th>Tipo</Table.Th>
                                                <Table.Th>Descripción</Table.Th>
                                                <Table.Th>Método</Table.Th>
                                                <Table.Th ta="right">Monto (USD)</Table.Th>
                                                <Table.Th ta="right">Monto (BS)</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {!pedido.movimientos?.length ? (
                                                <Table.Tr><Table.Td colSpan={6} ta="center" c="dimmed">No hay movimientos financieros.</Table.Td></Table.Tr>
                                            ) : (
                                                pedido.movimientos.map((mov) => (
                                                    <Table.Tr key={mov.id}>
                                                        <Table.Td>{formatearFecha(mov.fecha)}</Table.Td>
                                                        <Table.Td><Badge color={mov.tipo === 'INGRESO' ? 'teal' : 'red'} variant="light">{mov.tipo}</Badge></Table.Td>
                                                        <Table.Td>{mov.descripcion}</Table.Td>
                                                        <Table.Td>{mov.metodoPago}</Table.Td>
                                                        <Table.Td ta="right"><PrecioVisual valor={mov.montoUsd} simbolo="$" size="sm" c={mov.tipo === 'INGRESO' ? 'teal.7' : 'red.7'} fw={700} /></Table.Td>
                                                        <Table.Td ta="right"><PrecioVisual valor={mov.montoVes} simbolo="Bs" size="sm" c={mov.tipo === 'INGRESO' ? 'teal.7' : 'red.7'} fw={700} /></Table.Td>
                                                    </Table.Tr>
                                                ))
                                            )}
                                        </Table.Tbody>
                                    </Table>
                                </Table.ScrollContainer>
                            )}
                        </Paper>
                    </Tabs.Panel>
                )}
            </Tabs>

            {/* =================== MODALES =================== */}
            <Modal {...PANTALLA_COMPLETA_MOVIL} opened={modalEmpacar} onClose={() => setModalEmpacar(false)} title={<Title order={4} c="blue.9">Asignar personal de logística</Title>} centered>
                <form onSubmit={formEmpacar.onSubmit(handleConfirmarEmpaque)}>
                    <Stack gap="md">
                        <Select label="Empacador" data={opcionesEmpleados} withAsterisk {...formEmpacar.getInputProps('empacadorId')} />
                        <Select label="Etiquetador" data={opcionesEmpleados} withAsterisk {...formEmpacar.getInputProps('etiquetadorId')} />
                        <Button
                            loading={isSubmitting}
                            fullWidth
                            color="blue"
                            onClick={() => {
                                const v = formEmpacar.values;
                                if (!v.empacadorId || !v.etiquetadorId) return notifications.show({ message: 'Elige quién empaca y quién etiqueta', color: 'orange' });
                                handleAsignar(v);
                            }}
                        >
                            Asignar (cada quien firma su parte)
                        </Button>
                        <Button loading={isSubmitting} type="submit" fullWidth variant="light" color="blue">
                            Empacar ya sin verificación (atajo de administración)
                        </Button>
                    </Stack>
                </form>
            </Modal>

            <Modal
                {...PANTALLA_COMPLETA_MOVIL}
                opened={modalDespacho}
                onClose={() => setModalDespacho(false)}
                title={<Title order={4} c="grape">{pedido.tipoEntrega === 'pickup' ? 'Confirmar Retiro en Tienda' : 'Gestión de Despacho y Agencia'}</Title>}
                centered
            >
                {pedido.tipoEntrega !== 'pickup' && !esNacional ? (
                    <EntregaChoferForm
                        key={`${pedido.id}-${pedido.quienRetira || ''}`}
                        numeroDocumento={pedido.numeroDocumento}
                        empresaInicial={pedido.quienRetira || ''}
                        cargando={isSubmitting}
                        onConfirmar={(v) => handleAction('ENTREGAR_CHOFER', { ...v, costoFlete: esVendedor ? 0 : formDespacho.values.costoFlete }, setModalDespacho, 'Entrega al chofer registrada con su firma.')}
                    >
                        {!esVendedor && (
                            <NumberInput
                                label={pedido.tipoVenta === 'ONLINE' ? 'Lo que cobró el delivery' : 'Lo que pagó la empresa por el flete (gasto)'}
                                description={pedido.tipoVenta === 'ONLINE' ? `Se compara con lo que se le cobró al cliente (${Number(pedido.costoFlete || 0).toFixed(2)}); genera un ajuste en tesorería` : 'El flete que se le cobra al cliente se fija en «Envío y transporte»'}
                                decimalScale={2}
                                min={0}
                                allowNegative={false}
                                inputMode="decimal"
                                {...formDespacho.getInputProps('costoFlete')}
                            />
                        )}
                    </EntregaChoferForm>
                ) : (
                    <form onSubmit={formDespacho.onSubmit((values) => {
                        const body = pedido.tipoEntrega === 'pickup'
                            ? { quienRetira: 'Cliente en Tienda (Pickup)', costoFlete: 0, fechaHoraRetiro: new Date().toISOString() }
                            : (esNacional ? { ...values, costoFlete: 0 } : values);
                        handleConfirmarDespacho(body);
                    })}>
                        <Stack gap="md">
                            {pedido.tipoEntrega === 'pickup' ? (
                                <>
                                    <Text size="sm">¿Confirmas que el cliente ha retirado su pedido en tienda? Esto cambiará el estado de despacho a <b>COMPLETADO</b>.</Text>
                                    {!pagado && <Alert color="orange" variant="light" p="xs">Este pedido todavía no está pagado: registra el cobro en la pestaña <b>Estado de cuenta</b>.</Alert>}
                                </>
                            ) : (
                                <>
                                    <TextInput label={esNacional ? 'Zoom: número de guía' : 'Chofer / Agencia de Delivery'} withAsterisk {...formDespacho.getInputProps('quienRetira')} />
                                    <TextInput type="datetime-local" label="Fecha y Hora de Entrega a Agencia" withAsterisk {...formDespacho.getInputProps('fechaHoraRetiro')} />
                                    {!esNacional && (
                                        <NumberInput
                                            label={pedido.tipoVenta === 'ONLINE' ? 'Lo que cobró el delivery' : 'Lo que pagó la empresa por el flete (gasto)'}
                                            description={pedido.tipoVenta === 'ONLINE' ? `Se compara con lo que se le cobró al cliente (${Number(pedido.costoFlete || 0).toFixed(2)}); genera un ajuste en tesorería` : 'El flete que se le cobra al cliente se fija en «Envío y transporte»'}
                                            decimalScale={2}
                                            min={0}
                                            allowNegative={false}
                                            inputMode="decimal"
                                            withAsterisk
                                            {...formDespacho.getInputProps('costoFlete')}
                                        />
                                    )}
                                    <Text size="xs" c="dimmed">{esNacional ? 'Envío por Zoom con cobro a destino: el cliente paga el flete al recibir.' : 'Al registrar esto, recuerda contactar a la agencia de delivery para el despacho.'}</Text>
                                </>
                            )}
                            <Button loading={isSubmitting} type="submit" fullWidth color="grape">
                                {pedido.tipoEntrega === 'pickup' ? 'Marcar como Retirado' : (pedido.tipoVenta === 'ONLINE' ? 'Asentar Despacho' : 'Asentar Despacho y Gasto')}
                            </Button>
                        </Stack>
                    </form>
                )}
            </Modal>

            {modalCorregir && <CorregirFacturaModal opened onClose={() => setModalCorregir(false)} pedido={pedido} onListo={refetch} onEliminada={() => router.push('/superuser/ventas')} />}
            {modalNotaAFactura && <FacturarNotasModal opened onClose={() => setModalNotaAFactura(false)} pedido={pedido} onListo={refetch} />}

            <Modal {...PANTALLA_COMPLETA_MOVIL} opened={modalFactura} onClose={() => setModalFactura(false)} title={<Title order={4}>Convertir en factura</Title>} centered>
                <Stack gap="md">
                    <Text size="sm">El recibo <b>{pedido.numeroDocumento}</b> pasará a ser una <b>factura</b>: con el número F- que escribas abajo (si ya la emitiste en el sistema anterior) o con uno nuevo, y fecha de emisión la que indiques o <b>la de hoy</b>. Entrará al libro de ventas de ese periodo.</Text>
                    <DatosDeCopia valores={copiaFactura} onCambio={setCopiaFactura} />
                    <Text size="sm">El IVA ya cobrado dejará de contar como ingreso de la tienda y quedará reservado para pagar al SENIAT. Esta acción no se puede deshacer.</Text>
                    <Button loading={isSubmitting} fullWidth color="indigo" onClick={handleConvertirFactura}>Sí, convertir en factura</Button>
                </Stack>
            </Modal>

            <Modal {...PANTALLA_COMPLETA_MOVIL} opened={modalCobroTienda} onClose={() => setModalCobroTienda(false)} title={<Title order={4} c="green.9">Registrar cobro en tienda</Title>} centered>
                <Stack gap="md">
                    <Text size="sm">El cliente paga el total de la compra <b>{pedido.numeroDocumento}</b>: <PrecioVisual valor={pedido.totalFinal} simbolo={pedido.moneda} size="sm" fw={800} /> (≈ {equivalente(pedido.totalFinal)} a la tasa del pedido).</Text>
                    <Select
                        label="¿Cómo pagó?"
                        allowDeselect={false}
                        data={['Efectivo ($)', 'Efectivo (Bs)', 'Pago Móvil', 'Punto de Venta Provincial', 'Punto de Venta Banesco', 'Biopago', 'Cashea', 'Transferencia', 'Zelle']}
                        value={cobroTienda.metodoPago}
                        onChange={(v) => setCobroTienda((c) => ({ ...c, metodoPago: v }))}
                    />
                    <TextInput label="Referencia (opcional)" placeholder="Número de la operación" value={cobroTienda.referencia} onChange={(e) => { const v = e.currentTarget.value; setCobroTienda((c) => ({ ...c, referencia: v })); }} />
                    <Text size="xs" c="dimmed">El pedido queda pagado y el ingreso entra hoy a caja. Si el pago fue por Pago Móvil y llegó el aviso del banco, mejor vincúlalo desde Pagos recibidos.</Text>
                    <Button loading={isSubmitting} color="green" leftSection={<IconCash size={18} />} onClick={() => handleAction('COBRAR_TIENDA', cobroTienda, setModalCobroTienda, 'Cobro registrado: el pedido quedó pagado.')}>
                        Confirmar cobro
                    </Button>
                </Stack>
            </Modal>

            <Modal {...PANTALLA_COMPLETA_MOVIL} opened={modalAbono} onClose={() => setModalAbono(false)} title={<Title order={4} c="green.9">Registrar Pago / Abono</Title>} centered>
                <form onSubmit={formAbono.onSubmit(handleRegistrarAbono)}>
                    <Stack gap="md">
                        <Text size="sm" c="dimmed" mb="-sm">Saldo pendiente actual: <PrecioVisual valor={saldoCuenta} simbolo={monedaCuenta} size="sm" fw={700} /></Text>

                        <SimpleGrid cols={2} spacing="sm">
                            <NumberInput label="Monto a abonar" decimalScale={2} min={0} allowNegative={false} inputMode="decimal" withAsterisk {...formAbono.getInputProps('montoAbono')} />
                            <Select label="Moneda del pago" data={['USD', 'BS']} allowDeselect={false} withAsterisk {...formAbono.getInputProps('monedaAbono')} />
                        </SimpleGrid>
                        {formAbono.values.monedaAbono !== monedaCuenta && (
                            <Text size="xs" c="orange.8">
                                Se convierte con la tasa BCV de hoy ({precioBCV || '…'} Bs/$)
                                {precioBCV > 0 && Number(formAbono.values.montoAbono) > 0
                                    ? `: equivale a ${monedaCuenta === 'USD' ? `$${aDolares(Number(formAbono.values.montoAbono), precioBCV).toFixed(2)}` : `Bs ${fmtBsNum(aBolivares(Number(formAbono.values.montoAbono), precioBCV))}`}`
                                    : ''}.
                            </Text>
                        )}
                        <Select label="Método de pago" data={['Transferencia', 'Pago Móvil', 'Punto de Venta Provincial', 'Punto de Venta Banesco', 'Biopago', 'Cashea', 'Efectivo', 'Zelle']} allowDeselect={false} withAsterisk {...formAbono.getInputProps('metodoPago')} />
                        <TextInput label="Referencia (Opcional)" placeholder="Nro de recibo o transferencia" {...formAbono.getInputProps('referencia')} />
                        {puedeRetener && (
                            <Switch
                                color="grape"
                                fw={700}
                                checked={formAbono.values.retuvo}
                                onChange={(e) => formAbono.setFieldValue('retuvo', e.currentTarget.checked)}
                                label={parecioRetener ? 'Aplicar retención de IVA (75 %) — el monto coincide' : 'Aplicar retención de IVA (75 %)'}
                                description={`Retención esperada: ${monedaCuenta === 'USD' ? '$' : 'Bs '}${retEsperada.toFixed(2)}. Baja la deuda desde ya; el comprobante se carga después.`}
                            />
                        )}
                        <Switch
                            color="teal"
                            fw={700}
                            checked={formAbono.values.cierra}
                            onChange={(e) => formAbono.setFieldValue('cierra', e.currentTarget.checked)}
                            label="El cliente indica que con este pago cierra la factura"
                            description="Si aún queda diferencia, pasa a «Dicen que pagaron completo» en Cuentas por cobrar."
                        />

                        <Button loading={isSubmitting} type="submit" fullWidth color="green" mt="md" leftSection={<IconCash size={18} />}>
                            Procesar Abono
                        </Button>
                    </Stack>
                </form>
            </Modal>

            {ofertaRecibo && <OfertaReciboAbono abonoId={ofertaRecibo.abonoId} documento={pedido.numeroDocumento} resumen={ofertaRecibo.resumen} onCerrar={() => setOfertaRecibo(null)} />}
            {modalAbonoCxc && cuentaPorCobrar && (
                <CambioDeudaModal
                    cuenta={{
                        id: cuentaPorCobrar.id,
                        documento: pedido.numeroDocumento,
                        cliente: pedido.cliente?.nombre || '',
                        saldo: Number(cuentaPorCobrar.saldoPendiente) || 0,
                        tipoDoc: pedido.tipoDocumento,
                        manual: false,
                        retEstado: (pedido.retenciones || [])[0]?.estado || null,
                        retEsperada: pedido.tipoDocumento === 'FACTURA' && Number(pedido.montoIva) > 0
                            ? Math.round((pedido.moneda === 'BS' ? Number(pedido.montoIva) / tasaDoc : Number(pedido.montoIva)) * 75) / 100
                            : 0,
                    }}
                    onCerrar={(guardado) => { setModalAbonoCxc(false); if (guardado) refetch(); }}
                />
            )}

            <Modal
                {...PANTALLA_COMPLETA_MOVIL}
                opened={galeriaModal.imagenes.length > 0}
                onClose={() => setGaleriaModal({ imagenes: [], indice: 0 })}
                title={
                    <Group gap="xs">
                        <Text fw={700}>Galería del Producto</Text>
                        {galeriaModal.imagenes.length > 0 && (
                            <Badge color="blue" variant="light">
                                {galeriaModal.imagenes[galeriaModal.indice]?.titulo} ({galeriaModal.indice + 1} de {galeriaModal.imagenes.length})
                            </Badge>
                        )}
                    </Group>
                }
                centered
                size="lg"
            >
                {galeriaModal.imagenes.length > 0 && (
                    <Stack align="center" gap="md">
                        <Box ta="center" pos="relative" w="100%">
                            <Box
                                component="img"
                                src={galeriaModal.imagenes[galeriaModal.indice]?.url}
                                alt="Imagen ampliada"
                                style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 8 }}
                            />
                        </Box>
                        {galeriaModal.imagenes.length > 1 && (
                            <Group justify="center" gap="xl" mt="xs">
                                <Button variant="default" disabled={galeriaModal.indice === 0} onClick={() => setGaleriaModal((prev) => ({ ...prev, indice: prev.indice - 1 }))}>
                                    Anterior
                                </Button>
                                <Text size="sm" c="dimmed">{galeriaModal.indice + 1} / {galeriaModal.imagenes.length}</Text>
                                <Button color="blue" disabled={galeriaModal.indice === galeriaModal.imagenes.length - 1} onClick={() => setGaleriaModal((prev) => ({ ...prev, indice: prev.indice + 1 }))}>
                                    Siguiente
                                </Button>
                            </Group>
                        )}
                    </Stack>
                )}
            </Modal>

            {modalGestionNc && (
                <GestionNcEmpaqueModal
                    opened={modalGestionNc}
                    onClose={() => setModalGestionNc(false)}
                    ventaId={pedido.id}
                    numeroDocumento={pedido.numeroDocumento}
                    cliente={pedido.cliente?.nombre}
                    agencia={pedido.tipoEntrega === 'pickup' ? 'Retiro en tienda' : pedido.quienRetira}
                    ncAfectacion={empaqueNc}
                    onResuelto={() => refetch()}
                />
            )}
        </Box>
    );
}
