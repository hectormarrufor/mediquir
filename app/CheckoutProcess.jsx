'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Box, Stepper, Button, Group, Radio, Stack, Text, Paper, Loader, Alert, Divider, ThemeIcon, Checkbox, TextInput, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconBuildingStore, IconMotorbike, IconCheck, IconAlertCircle, IconUser, IconGps, IconMapPinCheck } from '@tabler/icons-react';
import { useCart } from './components/landing/CartContext';

// Coordenadas base de Mediquir en Ciudad Ojeda
const MEDIQUIR_LOCATION = { lat: 10.195099414915264, lng: -71.31187255102861 };
const TARIFA_BASE_DELIVERY = 1.5;
const TARIFA_POR_KM = 0.5;

export default function CheckoutProcess({ onCancel, onSuccess, tasaBcv = 36.5 }) {

    const { cart, subtotal, totalImpuestos, clearCart } = useCart();
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
    const [calculandoDistancia, setCalculandoDistancia] = useState(false);

    // Referencias para Google Maps Interactivo
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerInstanceRef = useRef(null);

    // Pago State
    const [referencia, setReferencia] = useState('');
    const [procesandoPago, setProcesandoPago] = useState(false);
    const [errorPago, setErrorPago] = useState('');

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

    // Renderizar o actualizar el mapa interactivo cuando hay coordenadas GPS
    useEffect(() => {
        if (metodoEntrega === 'delivery' && coordenadasGPS && window.google && mapContainerRef.current) {
            if (!mapInstanceRef.current) {
                mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
                    center: coordenadasGPS,
                    zoom: 17,
                    mapTypeControl: false,
                    streetViewControl: false,
                });

                markerInstanceRef.current = new window.google.maps.Marker({
                    position: coordenadasGPS,
                    map: mapInstanceRef.current,
                    draggable: true,
                    title: "Arrastra el pin a tu ubicación exacta"
                });

                markerInstanceRef.current.addListener('dragend', (event) => {
                    const nuevasCoords = { lat: event.latLng.lat(), lng: event.latLng.lng() };
                    setCoordenadasGPS(nuevasCoords);
                    calcularDistanciaConGoogle(nuevasCoords);
                });
            } else {
                mapInstanceRef.current.setCenter(coordenadasGPS);
                markerInstanceRef.current.setPosition(coordenadasGPS);
            }
        }
    }, [coordenadasGPS, metodoEntrega]);

    // GEOLOCALIZACIÓN FLEXIBLE (Permite arrastrar el pin aunque la precisión sea baja)
    const obtenerUbicacionGPS = () => {
        if (!navigator.geolocation) {
            alert("Tu navegador no soporta geolocalización.");
            return;
        }

        setObteniendoGPS(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                setObteniendoGPS(false);
                setPrecisionGPS(accuracy);

                if (accuracy > 22) {
                    alert(`Nota: La señal GPS tiene una precisión de ${accuracy.toFixed(1)} metros. No te preocupes, puedes arrastrar el marcador rojo en el mapa hasta tu domicilio exacto.`);
                }

                const coords = { lat: latitude, lng: longitude };
                setCoordenadasGPS(coords);
                calcularDistanciaConGoogle(coords);
            },
            (error) => {
                setObteniendoGPS(false);
                alert("No se pudo obtener la ubicación exacta automáticamente. Hemos centrado el mapa; por favor, arrastra el marcador rojo hasta tu domicilio.");
                setCoordenadasGPS(MEDIQUIR_LOCATION);
                calcularDistanciaConGoogle(MEDIQUIR_LOCATION);
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    };

    const calcularDistanciaConGoogle = (destinoLatLng) => {
        setCalculandoDistancia(true);
        const service = new window.google.maps.DistanceMatrixService();

        service.getDistanceMatrix({
            origins: [MEDIQUIR_LOCATION],
            destinations: [destinoLatLng],
            travelMode: window.google.maps.TravelMode.DRIVING,
        }, (response, status) => {
            setCalculandoDistancia(false);
            if (status === 'OK' && response.rows[0].elements[0].status === 'OK') {
                const kilometros = response.rows[0].elements[0].distance.value / 1000;
                setDistanciaKm(kilometros);
                setCostoDelivery(Number((TARIFA_BASE_DELIVERY + (kilometros * TARIFA_POR_KM)).toFixed(2)));
            } else {
                alert("No pudimos calcular la ruta desde esta ubicación.");
            }
        });
    };

    const costoDeliveryFinal = metodoEntrega === 'delivery' ? costoDelivery : 0;
    const totalPagarUSD = subtotal + totalImpuestos + costoDeliveryFinal;
    const totalPagarBS = totalPagarUSD * tasaBcv;
    const requierePagoOnline = metodoEntrega === 'delivery' || Boolean(pagoOnlinePickup);

    const handleSiguiente = () => {
        if (activeStep === 0 && formCliente.validate().hasErrors) return;
        if (activeStep === 1 && metodoEntrega === 'delivery' && !coordenadasGPS) {
            return alert("Debes marcar tu ubicación GPS en el mapa para continuar.");
        }
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
                formCliente.setValues({
                    ...formCliente.values,
                    nombre: c.nombre || '',
                    telefono: c.telefono || '',
                    email: c.email || '',
                });
            }
        } catch (error) {
            console.error("Error al buscar historial del cliente:", error);
        } finally {
            setBuscandoCliente(false);
        }
    };

    const procesarCompra = async (intentoActual = 1) => {
        setProcesandoPago(true);
        if (intentoActual === 1) {
            setErrorPago('');
            setMensajeCarga('Verificando tu pago en el banco...');
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
                    cart, cliente: clientePayload, metodoEntrega, pagoOnlinePickup,
                    coordenadasGPS, costoDelivery: costoDeliveryFinal,
                    totalPagarUSD, totalImpuestos, tasaBcv,
                    pagoMovil: requierePagoOnline ? { referencia } : null
                })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.errorType === 'PAGO_NO_ENCONTRADO' && intentoActual < 6) {
                    setTimeout(() => procesarCompra(intentoActual + 1), 5000);
                    return;
                }
                
                throw new Error(
                    data.errorType === 'PAGO_NO_ENCONTRADO' 
                    ? 'Tranquilo, tu dinero está seguro pero la red bancaria está tardando en enviarnos el mensaje. Por favor, asegúrate de que la referencia es correcta, espera 1 minuto y vuelve a intentarlo.'
                    : data.message || 'Error al procesar la orden'
                );
            }

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
                                <Stack align="center" ta="center">
                                    <ThemeIcon size={40} radius="xl" color="blue" variant="light"><IconGps size={22} /></ThemeIcon>
                                    <Box>
                                        <Text fw={700} size="sm">Ubicación GPS de tu Domicilio</Text>
                                        <Text size="xs" c="dimmed" maw={320} mt={2}>
                                            Haz clic para obtener tu GPS y <b>arrastra el marcador rojo</b> si necesitas ajustar el punto exacto en el mapa.
                                        </Text>
                                    </Box>
                                    <Button color="#005AAA" size="xs" radius="xl" leftSection={<IconMapPinCheck size={16} />} onClick={obtenerUbicacionGPS} loading={obteniendoGPS}>
                                        {coordenadasGPS ? 'Reubicar con mi GPS' : 'Detectar mi Ubicación GPS'}
                                    </Button>

                                    {/* MAPA INTERACTIVO DE GOOGLE */}
                                    <Box ref={mapContainerRef} w="100%" h="220px" style={{ borderRadius: '8px', border: '1px solid #ced4da', display: coordenadasGPS ? 'block' : 'none' }} />

                                    {calculandoDistancia && <Loader size="xs" mt="sm" />}

                                    {coordenadasGPS && !calculandoDistancia && (
                                        <Paper bg="white" p="xs" radius="md" w="100%" withBorder>
                                            <Group justify="space-between">
                                                <Text size="xs" c="teal" fw={700}>✓ Pin fijado {precisionGPS ? `(Precisión: ${precisionGPS.toFixed(0)}m)` : ''}</Text>
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
                    </Stack>
                </Stepper.Step>

                {/* PASO 3: CONFIRMACIÓN Y PAGO */}
                <Stepper.Step label="Pago" description="Confirmación">
                    <Stack mt="xl" gap="md">
                        <Paper withBorder p="md" radius="md" bg="gray.0">
                            <Group justify="space-between"><Text size="sm">Subtotal:</Text><Text size="sm">${subtotal.toFixed(2)}</Text></Group>
                            <Group justify="space-between"><Text size="sm">IVA (16%):</Text><Text size="sm">${totalImpuestos.toFixed(2)}</Text></Group>
                            {metodoEntrega === 'delivery' && <Group justify="space-between"><Text size="sm">Delivery:</Text><Text size="sm">${costoDelivery.toFixed(2)}</Text></Group>}
                            <Divider my="sm" />
                            <Group justify="space-between"><Text fw={900} size="lg">Total USD:</Text><Text fw={900} size="xl" c="#0B1B3D">${totalPagarUSD.toFixed(2)}</Text></Group>
                            <Group justify="space-between" mt={5}><Text fw={700} size="sm" c="dimmed">Total BS (Tasa: {tasaBcv}):</Text><Text fw={900} size="lg" c="blue.7">Bs {totalPagarBS.toFixed(2)}</Text></Group>
                        </Paper>

                        {requierePagoOnline ? (
                            <Paper withBorder p="md" radius="md" style={{ borderColor: '#005AAA' }}>
                                <Text fw={700} c="#005AAA" mb="xs">Datos para Pago Móvil ({metodoEntrega === 'pickup' ? 'Retiro Prepagado' : 'Delivery'})</Text>
                                <Text size="sm"><b>Banco:</b> Venezuela (0102)</Text>
                                <Text size="sm"><b>Teléfono:</b> 0414-1680773</Text>
                                <Text size="sm"><b>Cédula:</b> 19749601</Text>
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
                            </Paper>
                        ) : (
                            <Alert color="blue" title="Pago en Tienda">Reservaremos tu inventario. Realiza el pago en nuestras instalaciones al momento de retirar.</Alert>
                        )}
                    </Stack>
                </Stepper.Step>

                <Stepper.Completed>
                    <Stack align="center" ta="center" mt={50} mb={30}>
                        <Box bg="teal.1" p={20} style={{ borderRadius: '50%' }}><IconCheck size={50} color="teal" /></Box>
                        <Text fw={900} size="xl" mt="md">¡Orden Confirmada!</Text>
                        <Text c="dimmed" maw={300}>{requierePagoOnline ? 'Pago validado con éxito. Tu pedido está en preparación.' : 'Tus insumos están reservados para pago en tienda.'}</Text>
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
                        <Button color="#0B1B3D" onClick={handleSiguiente} disabled={activeStep === 1 && metodoEntrega === 'delivery' && !coordenadasGPS}>
                            Continuar
                        </Button>
                    )}

                    {activeStep === 2 && (
                        <Button
                            color="green"
                            onClick={() => procesarCompra(1)}
                            loading={procesandoPago}
                            loaderProps={{ type: 'dots' }}
                            disabled={requierePagoOnline && referencia.length < 4}
                        >
                            {procesandoPago ? mensajeCarga : 'Confirmar Orden'}
                        </Button>
                    )}
                </Group>
            )}
        </Box>
    );
}