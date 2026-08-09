"use client";
import { useState, useEffect } from "react";
import {
    Modal, Button, Select, Text, Group, Stack,
    Textarea, Alert, LoadingOverlay, Card, Divider,
    CopyButton, ActionIcon, Tooltip, Box, ScrollArea,
    SimpleGrid, ThemeIcon,
    Badge,
    Avatar
} from "@mantine/core";
import {
    IconAlertCircle, IconWallet, IconCopy, IconCheck,
    IconBuildingBank, IconDeviceMobile, IconCurrencyDollar
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

export default function ModalConfirmarPago({ opened, onClose, empleado, totalPagar, moneda, onPagoSuccess }) {
    const [cuentasEmpresa, setCuentasEmpresa] = useState([]);
    const [loadingCuentas, setLoadingCuentas] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [cuentaOrigenId, setCuentaOrigenId] = useState(null);
    const [monto, setMonto] = useState(totalPagar || 0);
    const [notas, setNotas] = useState("");

    // Actualizar monto si cambia el prop
    useEffect(() => {
        if (totalPagar) setMonto(totalPagar);
    }, [totalPagar]);

    // Cargar Cuentas Bancarias DE LA EMPRESA
    useEffect(() => {
        if (opened) {
            setLoadingCuentas(true);
            fetch('/api/tesoreria/cuentas-bancarias')
                .then(res => res.json())
                .then(data => setCuentasEmpresa(data))
                .catch(err => console.error(err))
                .finally(() => setLoadingCuentas(false));
        }
    }, [opened]);

    const handleConfirmar = async () => {
        setSubmitting(true);
        try {
            const res = await fetch('/api/rrhh/pagos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empleadoId: empleado.id,
                    monto: monto,
                    moneda: moneda,
                    cuentaBancariaId: cuentaOrigenId,
                    detalles: notas,
                    fecha: new Date()
                })
            });

            if (!res.ok) throw new Error("Error al registrar pago");

            notifications.show({
                title: 'Éxito',
                message: cuentaOrigenId ? 'Pago registrado y descontado.' : 'Gasto registrado como Pendiente.',
                color: 'green'
            });

            onPagoSuccess(empleado.id);
            onClose();

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setSubmitting(false);
        }
    };

    const hayCuentasOrigen = cuentasEmpresa.length > 0;
    const symbol = moneda === 'bcv' || moneda === 'euro' ? 'Bs.' : '$';
    // Formatear monto para visualización
    const montoFormatted = Number(monto).toFixed(2);

    // --- HELPER PARA BOTÓN DE COPIAR ---
    const CopyField = ({ value, label, color = "gray", icon }) => (
        <Box>
            {label && <Text size="10px" tt="uppercase" c="dimmed" fw={700}>{label}</Text>}
            <Group gap={6} align="center" wrap="nowrap" bg="white" p={4} style={{ borderRadius: 4, border: '1px solid #eee' }}>
                {icon && <ThemeIcon size="xs" color={color} variant="transparent">{icon}</ThemeIcon>}
                <Text size="sm" fw={600} truncate style={{ flex: 1 }}>{value}</Text>
                <CopyButton value={value} timeout={2000}>
                    {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Copiado' : 'Copiar'} withArrow position="right">
                            <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" size="sm" onClick={copy}>
                                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                            </ActionIcon>
                        </Tooltip>
                    )}
                </CopyButton>
            </Group>
        </Box>
    );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            // title={`Procesar Pago: ${empleado?.nombre} ${empleado?.apellido}`}
            centered
            size="lg"
        >
            <LoadingOverlay visible={submitting} />

            <Stack gap="md">
                {/* 1. RESUMEN DE MONTO GLOBAL */}
                
                    <Stack align="center">
                        <Avatar justify="center" size={120} src={process.env.NEXT_PUBLIC_BLOB_BASE_URL + "/" + empleado?.imagen} alt={`${empleado?.nombre} ${empleado?.apellido}`} />
                        <Text size="lg" fw={900}>Pago a {empleado?.nombre} {empleado?.apellido}</Text>
                        <Badge size="lg" color={empleado.calculos.moneda === "bcv" ? "green" : empleado.calculos.moneda === "euro" ? "violet" : "yellow"} >{empleado?.calculos.moneda}</Badge>
                    </Stack>
                    <Card withBorder padding="sm" radius="md" bg="green.0" style={{ borderColor: 'var(--mantine-color-green-3)' }}>
                        <Group justify="space-between">
                            <Group gap="xs">
                                <IconCurrencyDollar size={24} color="green" />
                                <Box>
                                    <Text size="xs" fw={700} c="green.9" tt="uppercase">Total a Transferir</Text>
                                    <Text fw={800} size="xl" c="green.9" lh={1}>
                                        {symbol} {Number(monto).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </Text>
                                </Box>
                            </Group>
                            {/* Botón rápido para copiar solo el número del monto */}
                            <CopyButton value={montoFormatted}>
                                {({ copied, copy }) => (
                                    <Button
                                        size="xs"
                                        color={copied ? "teal" : "green"}
                                        variant="white"
                                        onClick={copy}
                                        leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                    >
                                        Copiar Monto
                                    </Button>
                                )}
                            </CopyButton>
                        </Group>
                    </Card>

                    {/* 2. DATOS DE DESTINO (EMPLEADO) */}
                    {empleado.calculos.moneda !==  "usdt" ? 
                    <Box>
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={5}>Datos del Empleado (Destinatario)</Text>
                        
                            <Stack gap="sm">

                                {/* --- SECCIÓN PAGO MÓVIL --- */}
                                {empleado?.pagosMoviles?.map(pm => (
                                    <Card key={pm.id} withBorder padding="xs" radius="md" bg="blue.0" style={{ borderColor: 'var(--mantine-color-blue-2)' }}>
                                        <Group justify="space-between" mb="xs">
                                            <Group gap={6}>
                                                <ThemeIcon color="blue" variant="filled" size="md" radius="md">
                                                    <IconDeviceMobile size={18} />
                                                </ThemeIcon>
                                                <Box>
                                                    <Text size="xs" fw={700} c="blue" lh={1}>PAGO MÓVIL</Text>
                                                    <CopyField value={pm.nombreBanco}/>
                                                </Box>
                                            </Group>
                                        </Group>

                                        {/* Grid de Datos Copiables */}
                                        <SimpleGrid cols={2} spacing="xs">
                                            <CopyField label="Cédula / RIF" value={pm.cedulaCuenta} />
                                            <CopyField label="Teléfono" value={pm.numeroPagoMovil} />
                                        </SimpleGrid>
                                    </Card>
                                ))}

                                {/* --- SECCIÓN TRANSFERENCIA BANCARIA --- */}
                                {empleado?.cuentasBancarias?.map(cta => (
                                    <Card key={cta.id} withBorder padding="xs" radius="md" bg="gray.0">
                                        <Group justify="space-between" mb="xs">
                                            <Group gap={6}>
                                                <ThemeIcon color="gray" variant="filled" size="md" radius="md">
                                                    <IconBuildingBank size={18} />
                                                </ThemeIcon>
                                                <Box>
                                                    <Text size="xs" fw={700} c="dimmed" lh={1}>CUENTA BANCARIA</Text>
                                                        <CopyField value={cta.nombreBanco}/>
                                                </Box>
                                            </Group>
                                            <Badge size="xs" variant="outline" color="gray">{cta.tipoCuenta}</Badge>
                                        </Group>

                                        <Stack gap="xs">
                                            <CopyField label="Número de Cuenta" value={cta.numeroCuenta} />
                                            <SimpleGrid cols={2} spacing="xs">
                                                <CopyField label="Titular" value={cta.titularCuenta} />
                                                <CopyField label="Cédula / RIF" value={cta.cedulaCuenta} />
                                            </SimpleGrid>
                                        </Stack>
                                    </Card>
                                ))}

                                {(!empleado?.cuentasBancarias?.length && !empleado?.pagosMoviles?.length) && (
                                    <Alert color="gray" variant="light" py="xs" icon={<IconAlertCircle size={16} />}>
                                        <Text size="sm">El empleado no tiene datos bancarios registrados.</Text>
                                    </Alert>
                                )}
                            </Stack>
                      
                    </Box>
                    :
                    <Alert variant="light" color="blue" title="Pago en USDT" icon={<IconCurrencyDollar />}>
                        El empleado recibirá el pago en USDT a través de la plataforma acordada, al correo: <strong>hectormmarrufor@gmail.com</strong>.<br /> 
                        Por favor, asegúrate de coordinar los detalles directamente con el empleado.
                    </Alert>
                }

                    <Divider />

                    {/* 3. SELECCIÓN DE ORIGEN (EMPRESA) */}
                    <Box>
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={5}>Origen de Fondos (Empresa)</Text>
                        {loadingCuentas ? (
                            <Text size="sm" c="dimmed">Cargando cuentas...</Text>
                        ) : hayCuentasOrigen ? (
                            <Select
                                placeholder="Selecciona cuenta para debitar"
                                data={cuentasEmpresa.map(c => ({
                                    value: String(c.id),
                                    label: `${c.nombreBanco} - ${c.moneda} (Saldo: ${c.saldoActual})`
                                }))}
                                value={cuentaOrigenId}
                                onChange={setCuentaOrigenId}
                                clearable
                                searchable
                                leftSection={<IconWallet size={16} />}
                                description="Si dejas esto vacío, se generará una Cuenta por Pagar (Deuda)."
                            />
                        ) : (
                            <Alert variant="light" color="orange" title="Sin cuentas bancarias" icon={<IconAlertCircle />}>
                                No hay cuentas de la empresa registradas. Se registrará el gasto como "Pendiente".
                            </Alert>
                        )}
                    </Box>

                    <Textarea
                        label="Notas / Referencia"
                        placeholder="Ej: Pago nómina sem 42. Ref: 123456"
                        value={notas}
                        onChange={(e) => setNotas(e.currentTarget.value)}
                        rows={2}
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button
                            color={!cuentaOrigenId ? "orange" : "blue"}
                            leftSection={!cuentaOrigenId ? <IconAlertCircle size={16} /> : <IconWallet size={16} />}
                            onClick={handleConfirmar}
                            loading={submitting}
                        >
                            {!cuentaOrigenId ? "Registrar Deuda" : "Confirmar Pago"}
                        </Button>
                    </Group>
                </Stack>
        </Modal>
    );
}