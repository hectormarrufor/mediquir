"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
    Paper, Title, Text, Group, Button, Loader, Table,
    Badge, ScrollArea, Card, Avatar, Stack, ActionIcon,
    Center, Divider, Container, Box, SimpleGrid, ThemeIcon,
    rem
} from "@mantine/core";
import {
    IconCheck, IconChevronLeft, IconChevronRight, IconArrowLeft,
    IconCalendarStats, IconCurrencyDollar, IconRefresh, IconClock
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@mantine/hooks";
import { useAuth } from "@/hooks/useAuth"; // <--- 1. IMPORTAR useAuth
import { actualizarSueldos } from "@/app/helpers/calcularSueldo";
import ModalConfirmarPago from "./components/ModalConfirmarPago";

// --- HELPERS ---

const normalizeDate = (dateStr) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d;
};

const getRangoSemanal = (fechaBase) => {
    const fecha = new Date(fechaBase);
    const day = fecha.getDay(); 
    const diffToFriday = (day + 2) % 7;
    
    const inicio = new Date(fecha);
    inicio.setDate(fecha.getDate() - diffToFriday);
    inicio.setHours(0, 0, 0, 0);

    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    fin.setHours(23, 59, 59, 999);

    return { inicio, fin };
};

export default function PagosPage() {
    const router = useRouter();
    const { userId } = useAuth(); // <--- 2. OBTENER ID
    const isMobile = useMediaQuery('(max-width: 768px)');
    
    // Estados de Auth y Carga
    const [authChecking, setAuthChecking] = useState(true); // Controla el loader inicial de seguridad
    const [loading, setLoading] = useState(true); // Controla la carga de datos

    const [fechaReferencia, setFechaReferencia] = useState(new Date());
    const [empleados, setEmpleados] = useState([]);
    const [tasas, setTasas] = useState({ bcv: 0, eur: 0, usdt: 0 });
    
    const [modalPagoOpen, setModalPagoOpen] = useState(false);
    const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);

    // --- 3. EFECTO DE SEGURIDAD (Permisos) ---
    useEffect(() => {
        // Asumimos que si userId es undefined, aún está cargando useAuth
        if (userId !== undefined) {
            if (userId === 1 || userId === 3) {
                // Es Admin (1) o RRHH/Pagos (3) -> Permitir acceso
                setAuthChecking(false);
            } else {
                // No autorizado -> Redirigir
                notifications.show({ 
                    title: "Redirigiendo", 
                    message: "Página no disponible", 
                    color: "red",
                    icon: <IconClock size={18} />
                });
                router.replace('/superuser'); // Usamos replace para que no puedan volver atrás
            }
        }
    }, [userId, router]);

    const rango = useMemo(() => {
        const r = getRangoSemanal(fechaReferencia);
        return {
            inicio: r.inicio,
            fin: r.fin,
            inicioStr: r.inicio.toLocaleDateString('es-VE', {day: '2-digit', month: 'short'}),
            finStr: r.fin.toLocaleDateString('es-VE', {day: '2-digit', month: 'short', year: 'numeric'})
        };
    }, [fechaReferencia]);

    // Cargar datos (Solo se ejecuta si pasa la seguridad, ver el return abajo)
    const fetchData = async () => {
        setLoading(true);
        try {
            const [resEmpleados, resBcv] = await Promise.all([
                fetch("/api/rrhh/empleados?include=horasTrabajadas,cuentasBancarias,pagosMoviles,pagos&where=estado:Activo").then(r => r.json()),
                fetch("/api/bcv").then(r => r.json())
            ]);

            setTasas({
                bcv: resBcv.precio,
                eur: resBcv.eur,
                usdt: resBcv.usdt
            });

            const listaEmpleados = Array.isArray(resEmpleados) ? resEmpleados : resEmpleados.data || [];
            setEmpleados(listaEmpleados.sort((a, b) => b.HorasTrabajadas.length - a.HorasTrabajadas.length));

        } catch (error) {
            console.error(error);
            notifications.show({ title: "Error", message: "Error cargando datos", color: "red" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authChecking) {
            fetchData();
        }
    }, [authChecking]);

    const irSemanaAnterior = () => {
        const nuevaFecha = new Date(fechaReferencia);
        nuevaFecha.setDate(nuevaFecha.getDate() - 7);
        setFechaReferencia(nuevaFecha);
    };

    const irSemanaSiguiente = () => {
        const nuevaFecha = new Date(fechaReferencia);
        nuevaFecha.setDate(nuevaFecha.getDate() + 7);
        setFechaReferencia(nuevaFecha);
    };

    const irSemanaActual = () => {
        setFechaReferencia(new Date());
    };

    // --- LÓGICA DE NÓMINA (Sin cambios) ---
    const nominaCalculada = useMemo(() => {
        if (!empleados.length) return [];

        return empleados.map(emp => {
            const tasaCambio = emp.tasaSueldo === "euro" ? tasas.eur
                : emp.tasaSueldo === "usdt" ? tasas.usdt
                    : tasas.bcv;

            const valoresSueldo = actualizarSueldos("mensual", emp.sueldo);

            const horasRango = emp.HorasTrabajadas?.filter(h => {
                const fechaString = typeof h.fecha === 'string' && h.fecha.length === 10 
                    ? h.fecha + 'T12:00:00' 
                    : h.fecha;
                const fechaHora = new Date(fechaString);
                return fechaHora >= rango.inicio && fechaHora <= rango.fin;
            }) || [];

            const pagoSemana = emp.pagos?.find(g => {
                if (g.tipoOrigen !== 'Nomina') return false;
                const fechaPago = normalizeDate(g.fechaGasto);
                const fechaCierreSemana = normalizeDate(rango.fin); 
                const diffTime = fechaPago - fechaCierreSemana;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                return diffDays >= 1 && diffDays <= 8; 
            });

            const yaPagado = !!pagoSemana;
            const totalHoras = horasRango.reduce((acc, curr) => acc + curr.horas, 0);
            const horasExtra = horasRango.reduce((acc, curr) => {
                return curr.horas > 8 ? acc + (curr.horas - 8) : acc;
            }, 0);
            const horasNormales = emp.id === 6 || emp.id === 3 ? totalHoras - horasExtra + 16 : totalHoras - horasExtra;
            const pagoNormalUsd = horasNormales * valoresSueldo.horario;
            const pagoExtraUsd = horasExtra * valoresSueldo.horario;
            const totalPagarUsd = pagoNormalUsd + pagoExtraUsd;
            const pagoNormalBs = pagoNormalUsd * tasaCambio;
            const pagoExtraBs = pagoExtraUsd * tasaCambio;
            const totalPagarBs = totalPagarUsd * tasaCambio;

            return {
                ...emp,
                yaPagado,
                calculos: {
                    horasNormales, horasExtra, totalHoras,
                    pagoNormalUsd, pagoExtraUsd, totalPagarUsd,
                    pagoNormalBs, pagoExtraBs, totalPagarBs,
                    tasaUtilizada: tasaCambio,
                    moneda: emp.tasaSueldo || 'bcv'
                }
            };
        });
    }, [empleados, tasas, rango]);

    const totalNominaBs = nominaCalculada.reduce((acc, curr) => !curr.yaPagado ? acc + curr.calculos.totalPagarBs : acc, 0);
    const totalNominaUsd = nominaCalculada.reduce((acc, curr) => !curr.yaPagado ? acc + curr.calculos.totalPagarUsd : acc, 0);

    const handlePagar = async (emp) => {
        setEmpleadoSeleccionado(emp);
        setModalPagoOpen(true);
    };

    const onPagoSuccess = () => {
        fetchData();
    };

    // --- PANTALLA DE CARGA INICIAL (Protección) ---
    if (authChecking) {
        return (
            <Center h="100vh">
                <Stack align="center" gap="xs">
                    <Loader size="lg" type="dots" />
                    <Text c="dimmed" size="sm">Verificando permisos...</Text>
                </Stack>
            </Center>
        );
    }

    // --- COMPONENTES UI ---

    const StatCard = ({ title, value, icon: Icon, color }) => (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">{title}</Text>
                <ThemeIcon variant="light" color={color} size="md" radius="md">
                    <Icon style={{ width: rem(16), height: rem(16) }} />
                </ThemeIcon>
            </Group>
            <Text size="xl" fw={900} c={color}>{value}</Text>
        </Card>
    );

    const MobilePaymentCard = ({ emp }) => {
        const yaPagado = emp.yaPagado;
        const tieneHoras = emp.calculos.totalHoras > 0;
        const c = emp.calculos;
        return (
            <Card withBorder radius="md" mb="md" shadow="sm" style={{ opacity: yaPagado ? 0.7 : 1, backgroundColor: yaPagado ? '#f8f9fa' : 'white' }}>
                <Group justify="space-between" mb="xs">
                    {/* --- 4. CLICK EN MOVIL PARA IR AL PERFIL --- */}
                    <Group 
                        gap="sm" 
                        onClick={() => router.push(`/superuser/rrhh/empleados/${emp.id}`)}
                        style={{ cursor: 'pointer' }}
                    >
                        <Avatar src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} radius="xl" size="md" />
                        <div>
                            <Text fw={700} size="sm" lineClamp={1} td="underline">{emp.nombre} {emp.apellido}</Text>
                            <Badge variant="dot" size="xs" color={c.moneda === 'bcv' ? 'blue' : 'yellow'}>{c.moneda.toUpperCase()}</Badge>
                        </div>
                    </Group>
                    {yaPagado ? (
                        <Badge color="green" variant="filled" size="lg" leftSection={<IconCheck size={12} />}>Pagado</Badge>
                    ) : (
                        <Button size="xs" color="blue" variant="light" disabled={!tieneHoras} onClick={() => handlePagar(emp)}>Pagar</Button>
                    )}
                </Group>
                <Divider my="sm" />
                {tieneHoras ? (
                    <Stack gap="xs">
                        <Group grow align="center">
                            <Stack gap={0} align="center">
                                <Text size="xs" c="dimmed">Horas</Text>
                                <Badge variant="outline" color="gray">{c.totalHoras}h</Badge>
                            </Stack>
                            <Stack gap={0} align="center">
                                <Text size="xs" c="dimmed">USD</Text>
                                <Text fw={700} size="sm">${c.totalPagarUsd.toFixed(2)}</Text>
                            </Stack>
                            <Stack gap={0} align="center">
                                <Text size="xs" c="dimmed">BS</Text>
                                <Text fw={700} size="sm" c="blue">{c.totalPagarBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
                            </Stack>
                        </Group>
                    </Stack>
                ) : (
                    <Text c="dimmed" fs="italic" ta="center" size="xs">Sin horas registradas</Text>
                )}
            </Card>
        );
    };

    if (loading && empleados.length === 0) return (
        <Center h="80vh"><Stack align="center"><Loader size="lg" /><Text c="dimmed">Calculando nómina...</Text></Stack></Center>
    );

    return (
        <Container size="xl" py="md">
            {/* ENCABEZADO */}
            <Group justify="space-between" mb="lg" align="center">
                <Group>
                    <ActionIcon 
                        variant="subtle" 
                        color="gray" 
                        size="lg" 
                        onClick={() => router.back()}
                    >
                        <IconArrowLeft size={24} />
                    </ActionIcon>
                    <div>
                        <Title order={2}>Gestión de Pagos</Title>
                        <Text c="dimmed" size="sm">Cálculo semanal y emisión de pagos</Text>
                    </div>
                </Group>
                <Button 
                    variant="light" 
                    leftSection={<IconRefresh size={16} />} 
                    onClick={fetchData} 
                    loading={loading}
                >
                    Actualizar
                </Button>
            </Group>

            {/* BARRA DE NAVEGACIÓN DE FECHAS */}
            <Paper withBorder p="sm" radius="md" mb="xl" bg="gray.0">
                <Group justify="space-between">
                    <Button variant="default" size="xs" onClick={irSemanaAnterior} leftSection={<IconChevronLeft size={14} />}>
                        Anterior
                    </Button>
                    
                    <Group gap="xs">
                        <ThemeIcon variant="light" color="blue" size="md"><IconCalendarStats size={16}/></ThemeIcon>
                        <Text fw={700} size="md" tt="capitalize">
                            {rango.inicioStr} - {rango.finStr}
                        </Text>
                        <Badge variant="dot" color="green">Semana Laboral</Badge>
                    </Group>

                    <Group gap="xs">
                        <Button variant="default" size="xs" onClick={irSemanaActual}>Hoy</Button>
                        <Button variant="default" size="xs" onClick={irSemanaSiguiente} rightSection={<IconChevronRight size={14} />}>
                            Siguiente
                        </Button>
                    </Group>
                </Group>
            </Paper>

            <Stack mb="xl">
                {/* GRID DE TOTALES */}
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                    <StatCard 
                        title="Pendiente (Bs)" 
                        value={`Bs. ${totalNominaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`} 
                        icon={IconCurrencyDollar} 
                        color="blue" 
                    />
                    <StatCard 
                        title="Pendiente (USD)" 
                        value={`$${totalNominaUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
                        icon={IconCurrencyDollar} 
                        color="green" 
                    />
                    <Card shadow="sm" padding="lg" radius="md" withBorder>
                         <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Tasa BCV</Text>
                            <ThemeIcon variant="light" color="gray" size="md" radius="md"><IconClock style={{ width: rem(16), height: rem(16) }} /></ThemeIcon>
                        </Group>
                        <Group align="flex-end" gap="xs">
                            <Text size="xl" fw={900}>Bs. {tasas.bcv}</Text>
                            <Text size="xs" c="dimmed" mb={5}>/ USD</Text>
                        </Group>
                    </Card>
                </SimpleGrid>
            </Stack>

            {isMobile ? (
                <Box>
                    {nominaCalculada.map(emp => (
                        <MobilePaymentCard key={emp.id} emp={emp} />
                    ))}
                    {nominaCalculada.length === 0 && <Text ta="center" c="dimmed" mt="xl">No hay empleados activos en esta semana.</Text>}
                </Box>
            ) : (
                <Paper withBorder shadow="sm" radius="md" overflow="hidden">
                    <ScrollArea>
                        <Table striped highlightOnHover verticalSpacing="sm" withTableBorder>
                             <Table.Thead bg="gray.1">
                                <Table.Tr>
                                    <Table.Th rowSpan={2} w={300}>Empleado</Table.Th>
                                    <Table.Th colSpan={3} style={{ textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>Horas</Table.Th>
                                    <Table.Th colSpan={3} style={{ textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>Pago Estimado (USD)</Table.Th>
                                    <Table.Th rowSpan={2} style={{ textAlign: 'right' }}>Total Bs</Table.Th>
                                    <Table.Th rowSpan={2} style={{ textAlign: 'center' }}>Acción</Table.Th>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th style={{ textAlign: 'center', fontSize: 11 }}>Normal</Table.Th>
                                    <Table.Th style={{ textAlign: 'center', fontSize: 11 }}>Extra</Table.Th>
                                    <Table.Th style={{ textAlign: 'center', fontSize: 11, fontWeight: 700 }}>Total</Table.Th>
                                    <Table.Th style={{ textAlign: 'right', fontSize: 11 }}>Normal</Table.Th>
                                    <Table.Th style={{ textAlign: 'right', fontSize: 11 }}>Extra</Table.Th>
                                    <Table.Th style={{ textAlign: 'right', fontSize: 11, fontWeight: 700 }}>Total</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {nominaCalculada.map((emp) => {
                                    const yaPagado = emp.yaPagado;
                                    const tieneHoras = emp.calculos.totalHoras > 0;
                                    const c = emp.calculos;
                                    return (
                                        <Table.Tr key={emp.id} style={{ opacity: yaPagado ? 0.6 : 1, backgroundColor: yaPagado ? '#f8f9fa' : undefined }}>
                                            {/* --- 5. CLICK EN DESKTOP PARA IR AL PERFIL --- */}
                                            <Table.Td 
                                                onClick={() => router.push(`/superuser/rrhh/empleados/${emp.id}`)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <Group gap="sm">
                                                    <Avatar src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} radius="xl" size="md" />
                                                    <div>
                                                        <Text size="sm" fw={600} td="underline" style={{ textDecorationColor: '#ccc' }}>
                                                            {emp.nombre} {emp.apellido}
                                                        </Text>
                                                        <Badge size="xs" variant="outline" color={c.moneda === 'bcv' ? 'blue' : 'yellow'} mt={2}>{c.moneda.toUpperCase()}</Badge>
                                                    </div>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td align="center"><Text size="sm">{c.horasNormales}</Text></Table.Td>
                                            <Table.Td align="center"><Text size="sm" c={c.horasExtra > 0 ? "orange" : "dimmed"}>{c.horasExtra > 0 ? c.horasExtra : '-'}</Text></Table.Td>
                                            <Table.Td align="center"><Badge variant="light" color="gray" size="sm">{c.totalHoras}</Badge></Table.Td>
                                            
                                            <Table.Td align="right"><Text size="sm" c="dimmed">${c.pagoNormalUsd.toFixed(2)}</Text></Table.Td>
                                            <Table.Td align="right"><Text size="sm" c={c.horasExtra > 0 ? "orange" : "dimmed"}>{c.horasExtra > 0 ? `$${c.pagoExtraUsd.toFixed(2)}` : '-'}</Text></Table.Td>
                                            <Table.Td align="right"><Text size="sm" fw={700} c="green">${c.totalPagarUsd.toFixed(2)}</Text></Table.Td>
                                            
                                            <Table.Td align="right"><Text fw={700} size="sm" c="blue">Bs. {c.totalPagarBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</Text></Table.Td>
                                            
                                            <Table.Td align="center">
                                                {yaPagado ? (
                                                    <Badge color="green" variant="filled" size="md" leftSection={<IconCheck size={12} />}>Pagado</Badge>
                                                ) : (
                                                    <Button size="compact-sm" color="blue" variant="light" disabled={!tieneHoras} onClick={() => handlePagar(emp)}>Pagar</Button>
                                                )}
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                                {nominaCalculada.length === 0 && (
                                    <Table.Tr>
                                        <Table.Td colSpan={9}>
                                            <Center p="xl"><Text c="dimmed">No hay empleados activos esta semana.</Text></Center>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                </Paper>
            )}

            {empleadoSeleccionado && (
                <ModalConfirmarPago
                    opened={modalPagoOpen}
                    onClose={() => { setModalPagoOpen(false); setEmpleadoSeleccionado(null); }}
                    empleado={empleadoSeleccionado}
                    totalPagar={empleadoSeleccionado.tasaSueldo === 'bcv' || empleadoSeleccionado.tasaSueldo === "euro" ? empleadoSeleccionado.calculos.totalPagarBs : empleadoSeleccionado.calculos.totalPagarUsd}
                    moneda={empleadoSeleccionado.calculos.moneda}
                    onPagoSuccess={onPagoSuccess}
                />
            )}
        </Container>
    );
}