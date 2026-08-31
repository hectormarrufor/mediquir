'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Box, Stepper, Button, Group, Radio, Stack, Text, Paper, Loader, Alert, Divider, ThemeIcon, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconBuildingStore, IconMotorbike, IconCheck, IconAlertCircle, IconUser, IconGps, IconMapPinCheck } from '@tabler/icons-react';
import { useCart } from './components/landing/CartContext';

// Coordenadas base de Mediquir en Ciudad Ojeda
const MEDIQUIR_LOCATION = { lat: 10.195100738706866, lng: -71.31187591359996 };
const TARIFA_BASE_DELIVERY = 1.5; 
const TARIFA_POR_KM = 0.5; 

export default function CheckoutProcess({ onCancel, onSuccess, tasaBcv = 36.5 }) {
    const { cart, subtotal, totalImpuestos } = useCart();
    
    const [activeStep, setActiveStep] = useState(0);
    const [metodoEntrega, setMetodoEntrega] = useState('pickup'); 
    
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
    const [telefonoPago, setTelefonoPago] = useState('');
    const [procesandoPago, setProcesandoPago] = useState(false);
    const [errorPago, setErrorPago] = useState('');

    const formCliente = useForm({
        initialValues: { identificacion: '', nombre: '', telefono: '', email: '' },
        validate: {
            identificacion: (value) => (value.length < 5 ? 'Documento inválido' : null),
            nombre: (value) => (value.length < 3 ? 'Nombre muy corto' : null),
            telefono: (value) => (value.length < 10 ? 'Teléfono inválido' : null),
        },
    });

    // --- RENDERIZAR O ACTUALIZAR EL MAPA CUANDO HAY COORDENADAS ---
    useEffect(() => {
        if (metodoEntrega === 'delivery' && coordenadasGPS && window.google && mapContainerRef.current) {
            if (!mapInstanceRef.current) {
                // Crear el mapa por primera vez
                mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
                    center: coordenadasGPS,
                    zoom: 17,
                    mapTypeControl: false,
                    streetViewControl: false,
                });

                // Crear el marcador arrastrable (Comprobación humana)
                markerInstanceRef.current = new window.google.maps.Marker({
                    position: coordenadasGPS,
                    map: mapInstanceRef.current,
                    draggable: true, // ¡Permite al usuario ajustar el pin si el GPS falló un poco!
                    title: "Arrastra el pin a tu ubicación exacta"
                });

                // Escuchar cuando el usuario arrastra el marcador manualmente
                markerInstanceRef.current.addListener('dragend', (event) => {
                    const nuevaLat = event.latLng.lat();
                    const nuevaLng = event.latLng.lng();
                    const nuevasCoords = { lat: nuevaLat, lng: nuevaLng };
                    setCoordenadasGPS(nuevasCoords);
                    calcularDistanciaConGoogle(nuevasCoords);
                });
            } else {
                // Si el mapa ya existía, solo recentramos y movemos el marcador
                mapInstanceRef.current.setCenter(coordenadasGPS);
                markerInstanceRef.current.setPosition(coordenadasGPS);
            }
        }
    }, [coordenadasGPS, metodoEntrega]);

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

                if (accuracy > 22) { // Subí un poco el umbral a 22m para dar margen al GPS móvil real, pero puedes dejarlo en 8 si prefieres
                    alert(`La señal GPS tiene una precisión de ${accuracy.toFixed(1)} metros. Te sugerimos revisar el mapa y ajustar el marcador si es necesario.`);
                }

                const coords = { lat: latitude, lng: longitude };
                setCoordenadasGPS(coords);
                calcularDistanciaConGoogle(coords);
            },
            (error) => {
                setObteniendoGPS(false);
                alert("No se pudo obtener la ubicación. Asegúrate de otorgar permisos de GPS.");
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
                const distanceValue = response.rows[0].elements[0].distance.value; 
                const kilometros = distanceValue / 1000;
                setDistanciaKm(kilometros);
                setCostoDelivery(Number((TARIFA_BASE_DELIVERY + (kilometros * TARIFA_POR_KM)).toFixed(2)));
            } else {
                alert("No pudimos calcular la ruta desde esta ubicación.");
            }
        });
    };

    const totalPagarUSD = subtotal + totalImpuestos + (metodoEntrega === 'delivery' ? costoDelivery : 0);
    const totalPagarBS = totalPagarUSD * tasaBcv;

    const handleSiguiente = () => {
        if (activeStep === 0) {
            const { hasErrors } = formCliente.validate();
            if (hasErrors) return;
        }
        if (activeStep === 1 && metodoEntrega === 'delivery' && !coordenadasGPS) {
            alert("Debes marcar tu ubicación en el mapa para continuar.");
            return;
        }
        setActiveStep((current) => current + 1);
    };

    const procesarCompra = async () => {
        setProcesandoPago(true);
        setErrorPago('');

        try {
            const res = await fetch('/api/checkout/procesar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cart,
                    cliente: formCliente.values,
                    metodoEntrega,
                    coordenadasGPS, // Guardamos la ubicación exacta ajustada por el humano
                    costoDelivery,
                    totalPagarUSD,
                    totalImpuestos,
                    tasaBcv,
                    pagoMovil: metodoEntrega === 'delivery' ? { referencia, telefono: telefonoPago } : null
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Error al procesar la orden');

            setActiveStep(3);
            if (onSuccess) onSuccess(data);

        } catch (error) {
            setErrorPago(error.message);
        } finally {
            setProcesandoPago(false);
        }
    };

    return (
        <Box py="md">
            <Stepper active={activeStep} onStepClick={setActiveStep} color="#005AAA" size="sm" allowNextStepsSelect={false}>
                
                <Stepper.Step label="Tus Datos" description="Identificación">
                    <Stack mt="xl">
                        <Text fw={700} c="#0B1B3D" size="lg"><IconUser size={20} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Datos del Comprador</Text>
                        <TextInput label="Cédula / RIF" placeholder="Ej: V-12345678" withAsterisk {...formCliente.getInputProps('identificacion')} />
                        <TextInput label="Nombre Completo / Razón Social" placeholder="Ej: Juan Pérez" withAsterisk {...formCliente.getInputProps('nombre')} />
                        <TextInput label="Teléfono" placeholder="Ej: 04141234567" withAsterisk {...formCliente.getInputProps('telefono')} />
                    </Stack>
                </Stepper.Step>

                <Stepper.Step label="Entrega" description="Ubicación y Mapa">
                    <Stack mt="xl">
                        <Radio.Group value={metodoEntrega} onChange={setMetodoEntrega} label="Selecciona método de entrega" fw={700}>
                            <Stack mt="xs">
                                <Paper withBorder p="md" radius="md" bg={metodoEntrega === 'pickup' ? 'blue.0' : 'white'} onClick={() => setMetodoEntrega('pickup')} style={{ cursor: 'pointer' }}>
                                    <Group><IconBuildingStore size={24} color="#0B1B3D" /><Box><Text fw={700} c="#0B1B3D">Pagar y Retirar en Tienda</Text></Box></Group>
                                </Paper>
                                <Paper withBorder p="md" radius="md" bg={metodoEntrega === 'delivery' ? 'blue.0' : 'white'} onClick={() => setMetodoEntrega('delivery')} style={{ cursor: 'pointer' }}>
                                    <Group><IconMotorbike size={24} color="#0B1B3D" /><Box><Text fw={700} c="#0B1B3D">Delivery con Pago Móvil</Text></Box></Group>
                                </Paper>
                            </Stack>
                        </Radio.Group>

                        {metodoEntrega === 'delivery' && (
                            <Paper withBorder p="md" radius="md" mt="md" bg="gray.0">
                                <Stack align="center" ta="center">
                                    <ThemeIcon size={40} radius="xl" color="blue" variant="light">
                                        <IconGps size={22} />
                                    </ThemeIcon>
                                    <Box>
                                        <Text fw={700} size="sm">Confirma tu ubicación en el mapa</Text>
                                        <Text size="xs" c="dimmed" maw={320} mt={2}>
                                            Haz clic para obtener tu GPS y <b>arrastra el marcador rojo</b> si necesitas corregir el punto exacto de entrega.
                                        </Text>
                                    </Box>

                                    <Button 
                                        color="#005AAA" 
                                        size="xs"
                                        radius="xl" 
                                        leftSection={<IconMapPinCheck size={16} />} 
                                        onClick={obtenerUbicacionGPS}
                                        loading={obteniendoGPS}
                                    >
                                        {coordenadasGPS ? 'Reubicar con mi GPS' : 'Detectar mi Ubicación GPS'}
                                    </Button>

                                    {/* CONTENEDOR DEL MAPA INTERACTIVO DE GOOGLE */}
                                    <Box 
                                        ref={mapContainerRef} 
                                        w="100%" 
                                        h="220px" 
                                        style={{ borderRadius: '8px', border: '1px solid #ced4da', display: coordenadasGPS ? 'block' : 'none' }} 
                                    />

                                    {calculandoDistancia && <Loader size="xs" mt="sm" />}

                                    {coordenadasGPS && !calculandoDistancia && (
                                        <Paper bg="white" p="xs" radius="md" w="100%" withBorder>
                                            <Group justify="space-between">
                                                <Text size="xs" c="teal" fw={700}>✓ Pin fijado correctamente</Text>
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

                <Stepper.Step label="Pago" description="Confirma tu orden">
                    <Stack mt="xl" gap="md">
                        <Paper withBorder p="md" radius="md" bg="gray.0">
                            <Group justify="space-between"><Text size="sm">Subtotal:</Text><Text size="sm">${subtotal.toFixed(2)}</Text></Group>
                            <Group justify="space-between"><Text size="sm">IVA (16%):</Text><Text size="sm">${totalImpuestos.toFixed(2)}</Text></Group>
                            {metodoEntrega === 'delivery' && <Group justify="space-between"><Text size="sm">Delivery:</Text><Text size="sm">${costoDelivery.toFixed(2)}</Text></Group>}
                            <Divider my="sm" />
                            <Group justify="space-between">
                                <Text fw={900} size="lg">Total USD:</Text>
                                <Text fw={900} size="xl" c="#0B1B3D">${totalPagarUSD.toFixed(2)}</Text>
                            </Group>
                            <Group justify="space-between" mt={5}>
                                <Text fw={700} size="sm" c="dimmed">Total BS (Tasa: {tasaBcv}):</Text>
                                <Text fw={900} size="lg" c="blue.7">Bs {totalPagarBS.toFixed(2)}</Text>
                            </Group>
                        </Paper>

                        {metodoEntrega === 'delivery' ? (
                            <Paper withBorder p="md" radius="md" style={{ borderColor: '#005AAA' }}>
                                <Text fw={700} c="#005AAA" mb="xs">Datos para Pago Móvil</Text>
                                <Text size="sm"><b>Banco:</b> Venezuela (0102)</Text>
                                <Text size="sm"><b>Teléfono:</b> 0414-1680773</Text>
                                <Text size="sm"><b>Cedula:</b> V-19749601</Text>
                                <Divider my="md" />
                                <TextInput label="Últimos 4 dígitos de la referencia" maxLength={4} value={referencia} onChange={(e) => setReferencia(e.currentTarget.value.replace(/\D/g, ''))} mb="sm" required />
                                <TextInput label="Teléfono emisor" value={telefonoPago} onChange={(e) => setTelefonoPago(e.currentTarget.value.replace(/\D/g, ''))} required />
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
                        <Text c="dimmed" maw={300}>{metodoEntrega === 'delivery' ? 'Tu pago ha sido validado exitosamente.' : 'Tus insumos están reservados.'}</Text>
                    </Stack>
                </Stepper.Completed>
            </Stepper>

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
                        <Button color="green" onClick={procesarCompra} loading={procesandoPago} disabled={metodoEntrega === 'delivery' && (referencia.length < 4 || telefonoPago.length < 10)}>
                            Confirmar Orden
                        </Button>
                    )}
                </Group>
            )}
        </Box>
    );
}