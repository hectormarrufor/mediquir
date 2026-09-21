'use client';

import React, { useState, useEffect, useRef } from 'react';
import { avisoDespacho } from '@/app/constants/horario';
import { Box, Stepper, Button, Group, Radio, Stack, Text, Paper, Loader, Alert, Divider, ThemeIcon, Checkbox, TextInput, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconBuildingStore, IconMotorbike, IconCheck, IconAlertCircle, IconUser, IconGps, IconMapPinCheck } from '@tabler/icons-react';
import { useCart } from './components/landing/CartContext';
import { aBolivares } from '@/app/constants/facturacion';
import { DATOS_PAGO_MOVIL } from '@/app/constants/empresa';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { notifications } from '@mantine/notifications';
import { ZONAS_DELIVERY, UBICACION, clasificarUbicacion } from '@/app/constants/zonasDelivery';

// Coordenadas base de Mediquir en Ciudad Ojeda
const MEDIQUIR_LOCATION = { lat: 10.195099414915264, lng: -71.31187255102861 };
const TARIFA_BASE_DELIVERY = 1.5;
const TARIFA_POR_KM = 0.5;

export default function CheckoutProcess({ onCancel, onSuccess, tasaBcv: tasaProp }) {
    const { tasa: tasaHook } = useTasaBcv();
    const tasaBcv = Number(tasaProp) > 0 ? Number(tasaProp) : (tasaHook || 0);

    const { cart, subtotal, totalImpuestos, ivaDetalle, clearCart } = useCart();
    const [mensajeCarga, setMensajeCarga] = useState('Procesando orden...');
    const [buscandoCliente, setBuscandoCliente] = useState(false);
    const [activeStep, setActiveStep] = useState(0);
    const [metodoEntrega, setMetodoEntrega] = useState('pickup'); // 'pickup' | 'delivery'
    const [pagoOnlinePickup, setPagoOnlinePickup] = useState(false); // Si elige pickup pero quiere pagar online

    // Delivery & GPS State
    const [coordenadasGPS, setCoordenadasGPS] = useState(null);
    const [precisionGPS, setPrecisionGPS] = useState(null);
    const [obteniendoGPS, setObteniendoGPS] = useState(false);
    const [distanciaKm, setDistanciaKm] = useState(0);
    const [costoDelivery, setCostoDelivery] = useState(0);
    const [tipoUbicacion, setTipoUbicacion] = useState(UBICACION.ZONA); // ZONA (delivery) | NACIONAL (Zoom, cobro a destino) | FUERA_PAIS
    const [calculandoDistancia, setCalculandoDistancia] = useState(false);
    const [direccionMapa, setDireccionMapa] = useState(''); // dirección que entendió Google para el pin
    const [avisoMapa, setAvisoMapa] = useState('');

    // Referencias para Google Maps Interactivo
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerInstanceRef = useRef(null);

    // Pago State
    const [referencia, setReferencia] = useState('');
    const [procesandoPago, setProcesandoPago] = useState(false);
    const [errorPago, setErrorPago] = useState('');
    const [sinPagoEncontrado, setSinPagoEncontrado] = useState(false); // tras varios intentos no apareció el SMS del pago
    const [pendienteVerificacion, setPendienteVerificacion] = useState(false); // el pedido quedó registrado con el pago por verificar
    const idIntentoRef = useRef(null); // los reintentos automáticos comparten id: el servidor los cuenta como UN intento

    // Formulario de Cliente con Tipo de Documento y Contribuyente Especial
    const formCliente = useForm({
        initialValues: {
            tipoDoc: 'V-',
            numIdentificacion: '',
            nombre: '',
            telefono: '',
            email: '',
            esContribuyenteEspecial: false,
            porcentajeRetencion: '75' // '75' | '100'
        },
        validate: {
            numIdentificacion: (value) => (value.replace(/\D/g, '').length < 6 ? 'Número de documento inválido' : null),
            nombre: (value) => (value.length < 3 ? 'Nombre muy corto' : null),
            telefono: (value) => (value.replace(/\D/g, '').length < 10 ? 'Teléfono inválido (mínimo 10 dígitos)' : null),
        },
    });

    const obtenerIdentificacionFormateada = () => {
        const { tipoDoc, numIdentificacion } = formCliente.values;
        const digits = numIdentificacion.replace(/\D/g, '');

        if (tipoDoc === 'J-' || tipoDoc === 'G-') {
            if (digits.length > 1) {
                const cuerpo = digits.slice(0, -1);
                const digitoVerificador = digits.slice(-1);
                return `${tipoDoc}${cuerpo}-${digitoVerificador}`;
            }
            return `${tipoDoc}${digits}`;
        }

        return `${tipoDoc}${digits}`;
    };

    // ---- MAPA DE ENTREGA ----
    // El mapa se ve desde el principio, centrado en la zona de delivery. El cliente toca el mapa, arrastra el pin o usa su ubicación actual.
    const peticionRef = useRef(0); // ignora respuestas viejas si el cliente mueve el pin rápido

    // Pone (o mueve) el pin sin recalcular nada
    const ponerMarcador = (coords) => {
        const mapa = mapInstanceRef.current;
        if (!mapa || !window.google?.maps) return;
        if (!markerInstanceRef.current) {
            markerInstanceRef.current = new window.google.maps.Marker({ position: coords, map: mapa, draggable: true, title: 'Arrastra el pin hasta tu domicilio' });
            markerInstanceRef.current.addListener('dragend', (e) => colocarPin({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
        } else {
            markerInstanceRef.current.setPosition(coords);
        }
        mapa.panTo(coords);
        if ((mapa.getZoom() || 0) < 16) mapa.setZoom(17);
    };

    // El cliente marcó un punto (toque en el mapa, pin arrastrado o GPS): se pone el pin y se verifica la zona y la tarifa
    const colocarPin = (coords, precision = null) => {
        setCoordenadasGPS(coords);
        setPrecisionGPS(precision);
        ponerMarcador(coords);
        calcularDistanciaConGoogle(coords);
    };

    // El contenedor del mapa se vuelve a crear al cambiar de paso o de modalidad: si el mapa no está armado en el contenedor actual, se arma de nuevo
    useEffect(() => {
        if (activeStep !== 1 || metodoEntrega !== 'delivery') return;
        const el = mapContainerRef.current;
        if (!el || !window.google?.maps) return;
        if (mapInstanceRef.current?.getDiv() === el) return;
        mapInstanceRef.current = new window.google.maps.Map(el, {
            center: coordenadasGPS || MEDIQUIR_LOCATION,
            zoom: coordenadasGPS ? 17 : 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'greedy', // un dedo mueve el mapa (sin el mensaje de "usa dos dedos")
        });
        markerInstanceRef.current = null;
        mapInstanceRef.current.addListener('click', (e) => colocarPin({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
        if (coordenadasGPS) ponerMarcador(coordenadasGPS);
    }, [activeStep, metodoEntrega]);

    const obtenerUbicacionGPS = () => {
        if (!navigator.geolocation) {
            setAvisoMapa('Tu navegador no permite usar la ubicación. Toca el mapa para marcar tu domicilio.');
            return;
        }
        setAvisoMapa('');
        setObteniendoGPS(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setObteniendoGPS(false);
                colocarPin({ lat: position.coords.latitude, lng: position.coords.longitude }, position.coords.accuracy);
            },
            () => {
                setObteniendoGPS(false);
                setAvisoMapa('No pudimos usar tu ubicación (revisa el permiso del navegador). Toca el mapa para marcar tu domicilio.');
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    };

    // Delivery solo en Ciudad Ojeda, Lagunillas y Cabimas; el resto de Venezuela va por envío nacional. Si Google no responde se asume zona de delivery.
    const clasificarDestino = (latLng) => new Promise((resolve) => {
        try {
            new window.google.maps.Geocoder().geocode({ location: latLng }, (resultados, estado) => {
                if (estado === 'OK' && resultados?.length) {
                    const legible = resultados.find((r) => !r.types?.includes('plus_code')) || resultados[0]; // evita los códigos tipo "F3W9+2X"
                    resolve({ tipo: clasificarUbicacion(resultados), direccion: legible.formatted_address || '' });
                } else {
                    resolve({ tipo: UBICACION.ZONA, direccion: '' });
                }
            });
        } catch {
            resolve({ tipo: UBICACION.ZONA, direccion: '' });
        }
    });

    const calcularDistanciaConGoogle = async (destinoLatLng) => {
        if (!window.google?.maps) {
            setAvisoMapa('El mapa no está disponible en este momento. Recarga la página o elige retirar en tienda.');
            return;
        }
        const id = ++peticionRef.current;
        setAvisoMapa('');
        setCalculandoDistancia(true);
        const { tipo, direccion } = await clasificarDestino(destinoLatLng);
        if (id !== peticionRef.current) return;
        setTipoUbicacion(tipo);
        setDireccionMapa(direccion);
        if (tipo !== UBICACION.ZONA) {
            setDistanciaKm(0);
            setCostoDelivery(0);
            setCalculandoDistancia(false);
            return;
        }
        const service = new window.google.maps.DistanceMatrixService();

        service.getDistanceMatrix({
            origins: [MEDIQUIR_LOCATION],
            destinations: [destinoLatLng],
            travelMode: window.google.maps.TravelMode.DRIVING,
        }, (response, status) => {
            if (id !== peticionRef.current) return;
            setCalculandoDistancia(false);
            if (status === 'OK' && response.rows[0].elements[0].status === 'OK') {
                const kilometros = response.rows[0].elements[0].distance.value / 1000;
                setDistanciaKm(kilometros);
                setCostoDelivery(Number((TARIFA_BASE_DELIVERY + (kilometros * TARIFA_POR_KM)).toFixed(2)));
            } else {
                setDistanciaKm(0);
                setCostoDelivery(0);
                setAvisoMapa('No pudimos calcular la ruta hasta ese punto. Prueba moviendo el pin a una calle cercana.');
            }
        });
    };

    // Envío nacional: el pedido se paga sin delivery y el flete lo paga el cliente a Zoom al recibir (no pasa por la tienda)
    const esNacional = metodoEntrega === 'delivery' && tipoUbicacion === UBICACION.NACIONAL;
    const sinCobertura = metodoEntrega === 'delivery' && tipoUbicacion === UBICACION.FUERA_PAIS;
    const sinTarifa = metodoEntrega === 'delivery' && tipoUbicacion === UBICACION.ZONA && !(costoDelivery > 0); // ruta sin calcular
    const costoDeliveryFinal = metodoEntrega === 'delivery' && !esNacional ? costoDelivery : 0;
    const totalPagarUSD = Number((subtotal + totalImpuestos + costoDeliveryFinal).toFixed(2));
    const totalPagarBS = tasaBcv > 0 ? aBolivares(totalPagarUSD, tasaBcv) : 0; // el servidor recalcula con su propia tasa y precios
    const requierePagoOnline = metodoEntrega === 'delivery' || Boolean(pagoOnlinePickup); // el envío nacional también se paga por adelantado (solo los productos)
    // Fuera del horario de despacho (4:30 p. m. entre semana, 12:30 p. m. el sábado) el cliente debe saber que saldrá al día siguiente
    const avisoHorario = requierePagoOnline ? avisoDespacho() : null;
    const [aceptaHorario, setAceptaHorario] = useState(false);

    const handleSiguiente = () => {
        if (activeStep === 0 && formCliente.validate().hasErrors) return;
        if (activeStep === 1 && metodoEntrega === 'delivery' && !coordenadasGPS) {
            return setAvisoMapa('Marca tu domicilio en el mapa para continuar.');
        }
        if (activeStep === 1 && sinCobertura) return;
        setActiveStep((current) => current + 1);
    };

    const handleBuscarCliente = async () => {
        const numId = formCliente.values.numIdentificacion;
        if (numId.length < 5) return;

        setBuscandoCliente(true);
        const identificacionCompleta = obtenerIdentificacionFormateada();

        try {
            const res = await fetch(`/api/clientes/buscar?id=${identificacionCompleta}`);
            const data = await res.json();

            if (res.ok && data.success) {
                const c = data.cliente;
                if (c.nombre) {
                    // Solo el personal recibe la ficha completa
                    formCliente.setValues({ ...formCliente.values, nombre: c.nombre || '', telefono: c.telefono || '', email: c.email || '' });
                } else if (c.primerNombre) {
                    // El público solo recibe el primer nombre: se saluda, pero los datos los escribe la persona
                    notifications.show({ color: 'teal', title: `¡Hola de nuevo, ${c.primerNombre}!`, message: 'Completa tus datos para continuar con tu compra.', autoClose: 4500 });
                }
            }
        } catch (error) {
            console.error("Error al buscar historial del cliente:", error);
        } finally {
            setBuscandoCliente(false);
        }
    };

    // manual = true: el cliente asegura haber pagado y pide dejar el pedido registrado para que administración verifique su pago
    const procesarCompra = async (intentoActual = 1, manual = false) => {
        setProcesandoPago(true);
        if (intentoActual === 1) {
            if (!manual || !idIntentoRef.current) idIntentoRef.current = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
            setErrorPago('');
            setSinPagoEncontrado(false);
            setMensajeCarga(manual ? 'Registrando tu pedido...' : 'Verificando tu pago en el banco...');
        } else {
            setMensajeCarga(`Esperando confirmación del banco... (Intento ${intentoActual}/6)`);
        }

        const esJuridico = formCliente.values.tipoDoc === 'J-' || formCliente.values.tipoDoc === 'G-';
        const identificacionCompleta = obtenerIdentificacionFormateada();

        const clientePayload = {
            identificacion: identificacionCompleta,
            nombre: formCliente.values.nombre,
            telefono: formCliente.values.telefono,
            email: formCliente.values.email || null,
            direccion: metodoEntrega === 'delivery' && coordenadasGPS 
                ? `GPS: ${coordenadasGPS.lat}, ${coordenadasGPS.lng}` : null,
            esContribuyenteEspecial: esJuridico ? formCliente.values.esContribuyenteEspecial : false,
            porcentajeRetencionIVA: (esJuridico && formCliente.values.esContribuyenteEspecial) 
                ? Number(formCliente.values.porcentajeRetencion) : 0
        };

        try {
            const res = await fetch('/api/checkout/procesar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cart, cliente: clientePayload, metodoEntrega: esNacional ? 'nacional' : metodoEntrega, pagoOnlinePickup,
                    coordenadasGPS, direccionMapa, costoDelivery: costoDeliveryFinal,
                    pagoMovil: requierePagoOnline ? { referencia } : null,
                    idIntento: idIntentoRef.current,
                    verificacionManual: manual,
                })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.errorType === 'PAGO_NO_ENCONTRADO' && intentoActual < 6) {
                    setTimeout(() => procesarCompra(intentoActual + 1), 5000);
                    return;
                }
                // Tras ~30 segundos sin ver el pago: se le explica y puede corregir la referencia o dejar el pedido para verificación
                if (data.errorType === 'PAGO_NO_ENCONTRADO') {
                    setSinPagoEncontrado(true);
                    setProcesandoPago(false);
                    return;
                }

                throw new Error(data.message || 'Error al procesar la orden');
            }

            if (data.pendienteVerificacion) setPendienteVerificacion(true);

            const nuevoPedidoLocal = {
                ventaId: data.ventaId,
                numeroDocumento: data.numeroDocumento,
                fecha: new Date().toISOString(),
                metodoEntrega,
                totalUSD: totalPagarUSD,
                totalBS: totalPagarBS,
                items: cart.map(i => ({ nombre: i.product?.nombre || i.nombre, cantidad: i.quantity, precio: i.precioFinal }))
            };

            const pedidosAnteriores = JSON.parse(localStorage.getItem('mediquir_mis_pedidos') || '[]');
            localStorage.setItem('mediquir_mis_pedidos', JSON.stringify([nuevoPedidoLocal, ...pedidosAnteriores]));

            setActiveStep(3);
            if (onSuccess) onSuccess(data);
            setProcesandoPago(false);

        } catch (error) {
            setErrorPago(error.message);
            setProcesandoPago(false);
        }
    };

    // Totales de la compra: se ven al elegir la entrega y al pagar
    const resumenTotales = (
        <Paper withBorder p="md" radius="md" bg="gray.0">
            <Group justify="space-between"><Text size="sm">Subtotal:</Text><Text size="sm">${subtotal.toFixed(2)}</Text></Group>
            {ivaDetalle.length > 0
                ? ivaDetalle.map((d) => <Group key={d.alicuota} justify="space-between"><Text size="sm">IVA ({d.alicuota}%) sobre ${d.base.toFixed(2)}:</Text><Text size="sm">${d.iva.toFixed(2)}</Text></Group>)
                : <Group justify="space-between"><Text size="sm">IVA:</Text><Text size="sm">Exento</Text></Group>}
            {esNacional && <Group justify="space-between"><Text size="sm">Envío nacional por Zoom:</Text><Text size="sm">Cobro a destino</Text></Group>}
            {metodoEntrega === 'delivery' && !esNacional && <Group justify="space-between"><Text size="sm">Delivery (sin IVA):</Text><Text size="sm">${costoDelivery.toFixed(2)}</Text></Group>}
            <Divider my="sm" />
            <Group justify="space-between"><Text fw={900} size="lg">Total USD:</Text><Text fw={900} size="xl" c="#0B1B3D">${totalPagarUSD.toFixed(2)}</Text></Group>
            <Group justify="space-between" mt={5}><Text fw={700} size="sm" c="dimmed">Total BS (Tasa: {tasaBcv}):</Text><Text fw={900} size="lg" c="blue.7">Bs {totalPagarBS.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text></Group>
        </Paper>
    );

    return (
        <Box py="md">
            <Stepper active={activeStep} onStepClick={setActiveStep} color="#005AAA" size="sm" allowNextStepsSelect={false}>

                {/* PASO 1: DATOS DEL CLIENTE */}
                <Stepper.Step label="Tus Datos" description="Identificación">
                    <Stack mt="xl">
                        <Text fw={700} c="#0B1B3D" size="lg">
                            <IconUser size={20} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Datos del Comprador
                        </Text>

                        <Group grow align="flex-start" gap="xs">
                            <Select
                                label="Tipo"
                                style={{ flex: '0 0 95px' }}
                                data={[
                                    { value: 'V-', label: 'V-' },
                                    { value: 'J-', label: 'J-' },
                                    { value: 'E-', label: 'E-' },
                                    { value: 'G-', label: 'G-' },
                                    { value: 'P-', label: 'P-' },
                                ]}
                                {...formCliente.getInputProps('tipoDoc')}
                                onChange={(val) => {
                                    formCliente.setFieldValue('tipoDoc', val);
                                    if (formCliente.values.numIdentificacion.length > 4) {
                                        setTimeout(handleBuscarCliente, 100); 
                                    }
                                }}
                            />
                            <TextInput
                                style={{ flex: 1 }}
                                label="Cédula / RIF"
                                placeholder={formCliente.values.tipoDoc === 'J-' ? 'Ej: 123456789' : 'Ej: 12345678'}
                                withAsterisk
                                rightSection={buscandoCliente ? <Loader size="xs" color="#005AAA" /> : null}
                                {...formCliente.getInputProps('numIdentificacion')}
                                onBlur={handleBuscarCliente}
                                onChange={(e) => {
                                    const digitsOnly = e.currentTarget.value.replace(/\D/g, '');
                                    formCliente.setFieldValue('numIdentificacion', digitsOnly);
                                }}
                            />
                        </Group>

                        {(formCliente.values.tipoDoc === 'J-' || formCliente.values.tipoDoc === 'G-') && (
                            <Paper withBorder p="sm" radius="md" bg="blue.0" style={{ borderColor: '#005AAA' }}>
                                <Stack gap="xs">
                                    <Checkbox
                                        label={<Text size="sm" fw={600}>¿Esta empresa es Contribuyente Especial (SENIAT)?</Text>}
                                        {...formCliente.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })}
                                        color="#005AAA"
                                        disabled={buscandoCliente}
                                    />
                                    {formCliente.values.esContribuyenteEspecial && (
                                        <Radio.Group
                                            label="Porcentaje de Retención IVA:"
                                            size="sm"
                                            fw={600}
                                            {...formCliente.getInputProps('porcentajeRetencion')}
                                        >
                                            <Group mt="xs">
                                                <Radio value="75" label="75% de Retención" color="#005AAA" />
                                                <Radio value="100" label="100% de Retención" color="#005AAA" />
                                            </Group>
                                        </Radio.Group>
                                    )}
                                </Stack>
                            </Paper>
                        )}

                        <TextInput 
                            label="Nombre Completo / Razón Social" 
                            placeholder={buscandoCliente ? "Buscando en base de datos..." : "Ej: Juan Pérez o Inversiones M&M C.A."} 
                            withAsterisk 
                            disabled={buscandoCliente}
                            {...formCliente.getInputProps('nombre')} 
                        />
                        
                        <TextInput 
                            label="Teléfono de Contacto" 
                            placeholder="Ej: 04141234567" 
                            withAsterisk 
                            disabled={buscandoCliente}
                            {...formCliente.getInputProps('telefono')} 
                        />
                        
                        <TextInput 
                            label="Correo Electrónico (Opcional)" 
                            placeholder="correo@ejemplo.com" 
                            disabled={buscandoCliente}
                            {...formCliente.getInputProps('email')} 
                        />
                    </Stack>
                </Stepper.Step>

                {/* PASO 2: MODALIDAD DE ENTREGA */}
                <Stepper.Step label="Entrega" description="Modalidad y Mapa">
                    <Stack mt="xl">
                        <Radio.Group value={metodoEntrega} onChange={setMetodoEntrega} label="Selecciona método de entrega" fw={700}>
                            <Stack mt="xs">
                                <Paper withBorder p="md" radius="md" bg={metodoEntrega === 'pickup' ? 'blue.0' : 'white'} onClick={() => setMetodoEntrega('pickup')} style={{ cursor: 'pointer' }}>
                                    <Group><IconBuildingStore size={24} color="#0B1B3D" /><Box><Text fw={700} c="#0B1B3D">Retirar en Tienda (Pickup)</Text></Box></Group>
                                </Paper>
                                <Paper withBorder p="md" radius="md" bg={metodoEntrega === 'delivery' ? 'blue.0' : 'white'} onClick={() => setMetodoEntrega('delivery')} style={{ cursor: 'pointer' }}>
                                    <Group><IconMotorbike size={24} color="#0B1B3D" /><Box><Text fw={700} c="#0B1B3D">Envío a Domicilio (Delivery)</Text></Box></Group>
                                </Paper>
                            </Stack>
                        </Radio.Group>

                        {metodoEntrega === 'pickup' && (
                            <Paper withBorder p="sm" radius="md" mt="sm" bg="gray.0">
                                <Checkbox
                                    label={<Text size="sm" fw={600}>¿Deseas pagar online ahora con Pago Móvil para retirar rápido?</Text>}
                                    checked={pagoOnlinePickup}
                                    onChange={(e) => setPagoOnlinePickup(e.currentTarget.checked)}
                                    color="#005AAA"
                                />
                            </Paper>
                        )}

                        {metodoEntrega === 'delivery' && (
                            <Paper withBorder p="md" radius="md" mt="md" bg="gray.0">
                                <Stack gap="sm">
                                    <Group gap="xs" wrap="nowrap" align="flex-start">
                                        <ThemeIcon size={34} radius="xl" color="blue" variant="light"><IconGps size={20} /></ThemeIcon>
                                        <Box>
                                            <Text fw={700} size="sm">¿Dónde entregamos?</Text>
                                            <Text size="xs" c="dimmed">Toca el mapa para colocar el pin en tu domicilio o usa tu ubicación actual. Puedes arrastrar el pin para afinar el punto. Delivery en {ZONAS_DELIVERY.join(', ')}.</Text>
                                        </Box>
                                    </Group>

                                    <Button color="#005AAA" variant="light" radius="xl" fullWidth leftSection={<IconMapPinCheck size={16} />} onClick={obtenerUbicacionGPS} loading={obteniendoGPS}>
                                        Usar mi ubicación actual
                                    </Button>
                                    {avisoMapa && <Text size="xs" c="red.8" fw={600}>{avisoMapa}</Text>}

                                    {/* MAPA INTERACTIVO DE GOOGLE */}
                                    <Box ref={mapContainerRef} w="100%" h={260} style={{ borderRadius: '8px', border: '1px solid #ced4da' }} />

                                    {!coordenadasGPS && <Text size="xs" c="dimmed" ta="center">Todavía no has marcado tu domicilio en el mapa.</Text>}
                                    {calculandoDistancia && <Group justify="center" gap="xs"><Loader size="xs" /><Text size="xs" c="dimmed">Verificando tu zona...</Text></Group>}

                                    {coordenadasGPS && !calculandoDistancia && direccionMapa && (
                                        <Paper bg="white" p="xs" radius="md" withBorder>
                                            <Text size="xs" c="dimmed">Entregaremos cerca de:</Text>
                                            <Text size="sm" fw={600}>{direccionMapa}</Text>
                                            {precisionGPS ? <Text size="xs" c="dimmed">Precisión del GPS: {precisionGPS.toFixed(0)} m. Si no es exacto, arrastra el pin.</Text> : null}
                                        </Paper>
                                    )}

                                    {coordenadasGPS && !calculandoDistancia && tipoUbicacion === UBICACION.NACIONAL && (
                                        <Alert color="blue" variant="light" icon={<IconAlertCircle size={18} />} title="Tu ubicación queda fuera de nuestra zona de delivery">
                                            <Text size="sm">Nuestro delivery cubre {ZONAS_DELIVERY.join(', ')}. Tu pedido se enviará como <b>envío nacional por Zoom con cobro a destino</b>: pagas ahora solo tus productos y el flete lo cancelas a Zoom al recibir el envío.</Text>
                                        </Alert>
                                    )}

                                    {coordenadasGPS && !calculandoDistancia && sinCobertura && (
                                        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} title="No enviamos a esta ubicación">
                                            <Text size="sm">Solo realizamos envíos dentro de Venezuela. Marca una ubicación en el país para continuar.</Text>
                                        </Alert>
                                    )}

                                    {coordenadasGPS && !calculandoDistancia && tipoUbicacion === UBICACION.ZONA && costoDelivery > 0 && (
                                        <Paper bg="white" p="xs" radius="md" withBorder>
                                            <Group justify="space-between">
                                                <Text size="xs" c="teal.9" fw={700}>✓ Tenemos delivery hasta tu ubicación</Text>
                                                <Text size="xs">Distancia: <b>{distanciaKm.toFixed(1)} km</b></Text>
                                            </Group>
                                            <Divider my={4} />
                                            <Group justify="space-between">
                                                <Text size="sm" fw={700}>Tarifa de Delivery:</Text>
                                                <Text size="sm" c="red.7" fw={900}>${costoDelivery.toFixed(2)}</Text>
                                            </Group>
                                        </Paper>
                                    )}
                                </Stack>
                            </Paper>
                        )}
                        {resumenTotales}
                    </Stack>
                </Stepper.Step>

                {/* PASO 3: CONFIRMACIÓN Y PAGO */}
                <Stepper.Step label="Pago" description="Confirmación">
                    <Stack mt="xl" gap="md">
                        {resumenTotales}

                        {avisoHorario && (
                            <Alert color="orange" variant="light" icon={<IconAlertCircle size={18} />} title={`Tu pedido saldrá ${avisoHorario.cuando}`}>
                                <Text size="sm">{avisoHorario.texto}</Text>
                                <Checkbox mt="sm" checked={aceptaHorario} onChange={(e) => setAceptaHorario(e.currentTarget.checked)} label={`Entiendo que mi pedido se despachará ${avisoHorario.cuando} y quiero continuar`} />
                            </Alert>
                        )}

                        {requierePagoOnline ? (
                            <Paper withBorder p="md" radius="md" style={{ borderColor: '#005AAA' }}>
                                <Text fw={700} c="#005AAA" mb="xs">Datos para Pago Móvil ({metodoEntrega === 'pickup' ? 'Retiro Prepagado' : (esNacional ? 'Envío Nacional' : 'Delivery')})</Text>
                                <Text size="sm"><b>Banco:</b> {DATOS_PAGO_MOVIL.banco}</Text>
                                <Text size="sm"><b>Teléfono:</b> {DATOS_PAGO_MOVIL.telefono}</Text>
                                <Text size="sm"><b>Cédula:</b> {DATOS_PAGO_MOVIL.cedula}</Text>
                                <Divider my="md" />

                                <TextInput
                                    label="Últimos 4 dígitos de la referencia"
                                    placeholder="Ej: 4321"
                                    maxLength={4}
                                    value={referencia}
                                    onChange={(e) => setReferencia(e.currentTarget.value.replace(/\D/g, ''))}
                                    required
                                />

                                {errorPago && <Alert icon={<IconAlertCircle size={16} />} color="red" mt="md">{errorPago}</Alert>}

                                {sinPagoEncontrado && (
                                    <Alert icon={<IconAlertCircle size={18} />} color="orange" variant="light" mt="md" title="Todavía no vemos tu pago">
                                        <Text size="sm">Los bancos a veces tardan en avisarnos. Revisa que los <b>últimos 4 dígitos de la referencia</b> y el <b>monto exacto</b> (Bs {totalPagarBS.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) sean los de tu pago.</Text>
                                        <Group mt="sm" gap="xs">
                                            <Button size="xs" variant="default" onClick={() => { setSinPagoEncontrado(false); idIntentoRef.current = null; }}>Corregir la referencia y reintentar</Button>
                                            <Button size="xs" color="orange" loading={procesandoPago} onClick={() => procesarCompra(1, true)}>Ya pagué: registrar mi pedido para que lo verifiquen</Button>
                                        </Group>
                                        <Text size="xs" c="dimmed" mt="xs">Si registras el pedido, confirmaremos tu pago directamente en el banco y te avisaremos. Si el pago no existe, el pedido se cancela.</Text>
                                    </Alert>
                                )}
                            </Paper>
                        ) : (
                            <Alert color="blue" title="Pago en Tienda">Reservaremos tu inventario. Realiza el pago en nuestras instalaciones al momento de retirar.</Alert>
                        )}
                    </Stack>
                </Stepper.Step>

                <Stepper.Completed>
                    <Stack align="center" ta="center" mt={50} mb={30}>
                        <Box bg="teal.1" p={20} style={{ borderRadius: '50%' }}><IconCheck size={50} color="teal" /></Box>
                        <Text fw={900} size="xl" mt="md">{pendienteVerificacion ? '¡Pedido registrado!' : '¡Orden Confirmada!'}</Text>
                        <Text c="dimmed" maw={320}>{pendienteVerificacion ? 'Estamos verificando tu pago directamente en el banco. Apenas lo confirmemos, tu pedido pasa a preparación. Guarda tu número de pedido y la referencia por si necesitas escribirnos.' : requierePagoOnline ? `Pago validado con éxito. Tu pedido está en preparación${avisoHorario ? ` y se despachará ${avisoHorario.cuando}` : ''}.` : 'Tus insumos están reservados para pago en tienda.'}</Text>
                    </Stack>
                </Stepper.Completed>
            </Stepper>

            {/* BARRA INFERIOR DE NAVEGACIÓN */}
            {activeStep < 3 && (
                <Group justify="space-between" mt="xl" style={{ borderTop: '1px solid #E9ECEF', paddingTop: '15px' }}>
                    <Button variant="default" onClick={activeStep === 0 ? onCancel : () => setActiveStep((c) => c - 1)}>
                        {activeStep === 0 ? 'Volver al Carrito' : 'Atrás'}
                    </Button>

                    {activeStep < 2 && (
                        <Button color="#0B1B3D" onClick={handleSiguiente} disabled={activeStep === 1 && metodoEntrega === 'delivery' && (!coordenadasGPS || sinCobertura || sinTarifa || calculandoDistancia)}>
                            Continuar
                        </Button>
                    )}

                    {activeStep === 2 && (
                        <Button
                            color="green"
                            onClick={() => procesarCompra(1)}
                            style={sinPagoEncontrado ? { display: 'none' } : undefined}
                            loading={procesandoPago}
                            loaderProps={{ type: 'dots' }}
                            disabled={(requierePagoOnline && referencia.length < 4) || (Boolean(avisoHorario) && !aceptaHorario)}
                        >
                            {procesandoPago ? mensajeCarga : 'Confirmar Orden'}
                        </Button>
                    )}
                </Group>
            )}
        </Box>
    );
}