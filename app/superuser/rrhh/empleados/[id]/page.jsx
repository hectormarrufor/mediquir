"use client"

import React, { useEffect, useState } from "react"
import {
    Paper, Grid, Title, Text, Group, Button,
    Center, Loader, Stack, Badge, ScrollArea, Table,
    Modal, Flex, SimpleGrid, Box, Card, Avatar, Divider,
    ThemeIcon, Tabs, ActionIcon,
    UnstyledButton
} from "@mantine/core"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link";
import {
    IconEdit, IconPhone, IconId, IconCake,
    IconCurrencyDollar, IconBuildingBank, IconDeviceMobile,
    IconClock, IconBriefcase, IconNotes, IconLink,
    IconTrash,
    IconCalendar,
    IconShirt, IconShoe, IconHanger, IconRuler2,
    IconChevronLeft
} from "@tabler/icons-react";
import { useAuth } from "@/hooks/useAuth";
import { useMediaQuery } from "@mantine/hooks"; // <--- IMPORTANTE
import calcularEdad from "@/app/helpers/calcularEdad";
import { actualizarSueldos } from "@/app/helpers/calcularSueldo";

// Modales
import ModalCrearHora from "./ModalCrearHora";
import ModalCuentaBancaria from "./ModalCuentaBancaria";
import ModalPagoMovil from "./ModalPagoMovil";
import DocumentosManager from "../../components/DocumentosManager";
import { formatDateLong } from "@/app/helpers/dateUtils";
import { notifications } from "@mantine/notifications";

// --- COMPONENTE PARA EL REGISTRO DE HORAS EN MÓVIL ---
// Ahora recibe onEdit y onDelete
const MobileWorkLogCard = ({ log, onEdit, onDelete }) => {
    const isExtra = log.horas > 8;
    const fechaFormatted = formatDateLong(log.fecha);

    return (
        <Paper withBorder p="md" radius="md" mb="sm" shadow="xs">
            <Group justify="space-between" mb="xs">
                <Group gap="xs">
                    <IconClock size={16} color="gray" />
                    <Text fw={700} size="sm">{fechaFormatted}</Text>
                </Group>
                
                {/* GRUPO DE ACCIONES + BADGE */}
                <Group gap={5}>
                    <Badge color={isExtra ? 'orange' : 'blue'} variant="light" mr={5}>
                        {log.horas} hrs
                    </Badge>
                    
                    {/* BOTONES DE EDICIÓN MÓVIL */}
                    <ActionIcon variant="light" color="blue" size="sm" onClick={onEdit}>
                        <IconEdit size={14} />
                    </ActionIcon>
                    <ActionIcon variant="light" color="red" size="sm" onClick={onDelete}>
                        <IconTrash size={14} />
                    </ActionIcon>
                </Group>
            </Group>

            <Divider my="xs" variant="dashed" />

            <Stack gap="xs">
                <Group justify="space-between" align="center">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Origen</Text>
                    {log.origen === "odt" ? (
                        <Button
                            component={Link}
                            href={`/superuser/odt/${log.odtId}`}
                            variant="light"
                            size="xs"
                            rightSection={<IconLink size={12} />}
                        >
                            {log.observaciones.match(/ODT\s+#(\d+)/)?.[0] || 'Ver ODT'}
                        </Button>
                    ) : (
                        <Badge variant="outline" color="gray" size="sm">{log.origen}</Badge>
                    )}
                </Group>

                <Box>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>Observaciones</Text>
                    <Group gap="xs" align="flex-start" wrap="nowrap">
                        <ThemeIcon variant="light" color="gray" size="xs" mt={2}><IconNotes size={12} /></ThemeIcon>
                        <Text size="sm" style={{ lineHeight: 1.3 }}>{log.observaciones}</Text>
                    </Group>
                </Box>
            </Stack>
        </Paper>
    );
};

export default function Page({ params }) {
    const { id } = useParams(params);
    const router = useRouter();
    const [error, setError] = useState(null);

    // Detectar Móvil
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Estados de Datos
    const [empleado, setEmpleado] = useState(null)
    const [bcvPrecio, setBcvPrecio] = useState(0);
    const [cargando, setCargando] = useState(true);

    // Estados Calculados
    const [horasEstaSemana, setHorasEstaSemana] = useState(0);
    const [horasExtraEstaSemana, setHorasExtraEstaSemana] = useState(0);

    // Estados de UI
    const { rol } = useAuth();
    const [activeTab, setActiveTab] = useState('banco');

    // Modales
    const [modalCrearHora, setModalCrearHora] = useState(false);
    const [modalCuenta, setModalCuenta] = useState(false);
    const [modalPagoMovil, setModalPagoMovil] = useState(false);
    const [selectedHora, setSelectedHora] = useState(null);

    useEffect(() => {
        let mounted = true
        async function cargar() {
            try {
                const res = fetch(`/api/rrhh/empleados/${id}`).then(r => r.json())
                const bcv = fetch(`/api/bcv`).then(r => r.json())

                const [empleadofetched, bcvres] = await Promise.all([res, bcv]);

                if (!mounted) return;



                setBcvPrecio(empleadofetched.tasaSueldo === "bcv" ? bcvres.precio : empleadofetched.tasaSueldo === "euro" ? bcvres.eur : bcvres.usdt);

                // Cálculos de horas
                const horasTotal = empleadofetched.HorasTrabajadas?.reduce((total, hora) => total + hora.horas, 0) || 0;
                setHorasEstaSemana(empleadofetched.id === 6 || empleadofetched.id === 3 ? horasTotal + 16 :horasTotal);

                const horasExtra = empleadofetched.HorasTrabajadas?.reduce((total, hora) => {
                    return hora.horas > 8 ? total + (hora.horas - 8) : total;
                }, 0) || 0;
                setHorasExtraEstaSemana(horasExtra);

                setEmpleado({
                    ...empleadofetched,
                    edad: calcularEdad(empleadofetched.fechaNacimiento),
                    horario: actualizarSueldos("mensual", empleadofetched.sueldo).horario,
                    diario: actualizarSueldos("mensual", empleadofetched.sueldo).diario,
                    semanal: actualizarSueldos("mensual", empleadofetched.sueldo).semanal,
                });

            } catch (err) {
                setError(err);
                if (mounted) setEmpleado(null);
            } finally {
                if (mounted) setCargando(false)
            }
        }
        cargar()
        return () => (mounted = false)
    }, [id]);

    useEffect(() => {
        console.log(empleado);
    }, [empleado]);

    // Función para borrar horas (Faltaba en tu código original)
    const handleDeleteHora = async (horaId) => {
        if (!confirm("¿Estás seguro de eliminar este registro de horas?")) return;
        
        try {
            const res = await fetch(`/api/rrhh/horas-manuales/${horaId}`, { method: 'DELETE' });
            if (res.ok) {
                notifications.show({ title: 'Eliminado', message: 'Registro eliminado', color: 'green' });
                // Actualizar estado localmente para no recargar toda la página
                setEmpleado(prev => ({
                    ...prev,
                    HorasTrabajadas: prev.HorasTrabajadas.filter(h => h.id !== horaId)
                }));
            } else {
                notifications.show({ title: 'Error', message: 'No se pudo eliminar', color: 'red' });
            }
        } catch (error) {
            console.error(error);
            notifications.show({ title: 'Error', message: 'Error de conexión', color: 'red' });
        }
    };

    if (cargando) {
        return (
            <Center h="80vh">
                <Stack align="center">
                    <Loader size="lg" />
                    <Text c="dimmed">Cargando perfil...</Text>
                </Stack>
            </Center>
        )
    }

    if (error) return <Text align="center" mt="xl" color="red">Error: {error.message}</Text>;

    if (!empleado) return <Text align="center" mt="xl">Empleado no encontrado</Text>;

    // Helper Card Component for Stats
    const StatCard = ({ title, value, subtext, color = "blue", icon: Icon }) => (
        <Paper withBorder p="md" radius="md" shadow="xs">
            <Group justify="space-between">
                <div>
                    <Text c="dimmed" tt="uppercase" fw={700} size="xs">{title}</Text>
                    <Text fw={700} size="xl">{value}</Text>
                    {subtext && <Text c="dimmed" size="xs">{subtext}</Text>}
                </div>
                <ThemeIcon variant="light" color={color} size="lg" radius="md">
                    <Icon size="1.5rem" />
                </ThemeIcon>
            </Group>
        </Paper>
    );

    const horasNormales = horasEstaSemana - horasExtraEstaSemana;
    const totalPagarBs = ((horasEstaSemana * empleado.horario) * bcvPrecio).toFixed(2);
    const totalPagarUsd = (horasEstaSemana * empleado.horario).toFixed(2);
    const pagoHorasNormalesBs = (horasNormales * empleado.horario * bcvPrecio).toFixed(2);
    const pagoHorasExtraBs = (horasExtraEstaSemana * empleado.horario * bcvPrecio).toFixed(2);

    return (
        <Paper>
            {/* Header */}
            <Group justify="space-between" mb="lg">
                <Group>
                    <ActionIcon
                        variant="subtle" 
                        color="gray" 
                        size="lg" 
                        onClick={() => router.back()} // Acción para volver atrás
                    >
                        <IconChevronLeft size={24} />
                    </ActionIcon>
                    <div>
                        <Title order={2}>Perfil de Empleado</Title>
                        <Text c="dimmed" size="sm">Gestión de RRHH y Nómina</Text>
                    </div>
                </Group>

                <Button leftSection={<IconEdit size={18} />} variant="outline" onClick={() => router.push(`/superuser/rrhh/empleados/${empleado.id}/editar`)}>
                    Editar
                </Button>
            </Group>

            <Grid gutter="lg">
                {/* --- COLUMNA IZQUIERDA: PERFIL --- */}
                <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
                    <Card withBorder padding="xl" radius="md" shadow="sm">
                        <Card.Section inheritPadding py="md" bg="gray.0">
                           <Stack align="center" gap="xs" pt="xl"> 
                                <Avatar
                                    src={empleado.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${empleado.imagen}` : null}
                                    size={120} radius={120} color="blue"
                                    style={{ border: '4px solid white', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}
                                >
                                    {(!empleado.imagen) && empleado.nombre?.charAt(0)}
                                </Avatar>
                                <div style={{ textAlign: 'center' }}>
                                    <Title order={3}>{empleado.nombre}</Title>
                                    <Title order={3} c="dimmed" style={{ lineHeight: 1 }}>{empleado.apellido}</Title>
                                </div>
                                <Group gap={5} justify="center" mt={5}>
                                    {empleado.puestos?.map((p, i) => (
                                        <Badge key={i} variant="dot" size="md">{p.nombre}</Badge>
                                    ))}
                                </Group>
                            </Stack>
                        </Card.Section>

                        <Stack mt="md" gap="md">
                            <Group wrap="nowrap">
                                <IconId size={20} color="gray" style={{ minWidth: 20 }} />
                                <div><Text size="xs" c="dimmed">Cédula</Text><Text size="sm" fw={500}>{empleado.cedula}</Text></div>
                            </Group>
                            <Group wrap="nowrap">
                                <IconPhone size={20} color="gray" style={{ minWidth: 20 }} />
                                <div><Text size="xs" c="dimmed">Teléfono</Text><Text size="sm" fw={500}>{empleado.telefono}</Text></div>
                            </Group>
                            <Group wrap="nowrap">
                                <IconCake size={20} color="gray" style={{ minWidth: 20 }} />
                                <div><Text size="xs" c="dimmed">Edad</Text><Text size="sm" fw={500}>{empleado.edad} años</Text></div>
                            </Group>
                            <Group wrap="nowrap">
                                <IconCalendar size={20} color="gray" style={{ minWidth: 20 }} />
                                <div><Text size="xs" c="dimmed">Nacimiento</Text><Text size="sm" fw={500}>{formatDateLong(empleado.fechaNacimiento)}</Text></div>
                            </Group>
                            <Group wrap="nowrap">
                                <IconBriefcase size={20} color="gray" style={{ minWidth: 20 }} />
                                <div><Text size="xs" c="dimmed">Ingreso</Text><Text size="sm" fw={500}>{formatDateLong(empleado.fechaIngreso)}</Text></div>
                            </Group>

                            {(empleado.tallaCamisa || empleado.tallaPantalon || empleado.tallaCalzado || empleado.tallaBraga) && (
                                <>
                                    <Divider my="sm" label="Dotación" labelPosition="center" />
                                    <SimpleGrid cols={2} spacing="xs">
                                        <Paper withBorder p="xs" radius="md">
                                            <Group gap="xs">
                                                <ThemeIcon variant="light" color="blue" size="sm"><IconShirt size={14} /></ThemeIcon>
                                                <div><Text size="xs" c="dimmed" lh={1}>Camisa</Text><Text fw={700} size="sm">{empleado.tallaCamisa || '-'}</Text></div>
                                            </Group>
                                        </Paper>
                                        <Paper withBorder p="xs" radius="md">
                                            <Group gap="xs">
                                                <ThemeIcon variant="light" color="teal" size="sm"><IconHanger size={14} /></ThemeIcon>
                                                <div><Text size="xs" c="dimmed" lh={1}>Pantalón</Text><Text fw={700} size="sm">{empleado.tallaPantalon || '-'}</Text></div>
                                            </Group>
                                        </Paper>
                                        <Paper withBorder p="xs" radius="md">
                                            <Group gap="xs">
                                                <ThemeIcon variant="light" color="orange" size="sm"><IconShoe size={14} /></ThemeIcon>
                                                <div><Text size="xs" c="dimmed" lh={1}>Calzado</Text><Text fw={700} size="sm">{empleado.tallaCalzado || '-'}</Text></div>
                                            </Group>
                                        </Paper>
                                        <Paper withBorder p="xs" radius="md">
                                            <Group gap="xs">
                                                <ThemeIcon variant="light" color="grape" size="sm"><IconRuler2 size={14} /></ThemeIcon>
                                                <div><Text size="xs" c="dimmed" lh={1}>Braga</Text><Text fw={700} size="sm">{empleado.tallaBraga || '-'}</Text></div>
                                            </Group>
                                        </Paper>
                                    </SimpleGrid>
                                </>
                            )}

                            {(rol?.includes("Presidente") || rol?.includes("admin")) && (
                                <>
                                    <Divider my="sm" />
                                    <Title order={5} align="center">Sueldo</Title>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Base:</Text>
                                        <Badge size="lg" color="green" variant="light">${empleado.sueldo}</Badge>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Hora:</Text>
                                        <Text fw={700}>${empleado.horario}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Día:</Text>
                                        <Text fw={700}>${empleado.diario}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Semana:</Text>
                                        <Text fw={700}>${empleado.semanal}</Text>
                                    </Group>
                                </>
                            )}
                        </Stack>
                    </Card>
                </Grid.Col>

                {/* --- COLUMNA DERECHA: DASHBOARD --- */}
                <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
                    <Stack gap="lg">

                        {/* 1. KPIs */}
                        <div>
                            <Group justify="space-between" mb="xs">
                                <Title order={4}>Esta Semana</Title>
                                {(rol?.includes("Presidente") || rol?.includes("admin")) &&
                                    <Flex align="center" gap="md">

                                        <Badge variant="outline" color="gray">{empleado.tasaSueldo === "bcv" ? "BCV" : empleado.tasaSueldo === "euro" ? "Euro" : "USDT"}: {bcvPrecio} Bs</Badge>
                                        <UnstyledButton size="sm" onClick={() => {
                                            (async () => {
                                                setCargando(true);
                                                await fetch(`/api/bcv?force=true`)
                                                    .then(res => res.json())
                                                    .then(data => {
                                                        setBcvPrecio(data.precio)
                                                    });
                                                setCargando(false);
                                            })();
                                        }}>Actualizar tasa</UnstyledButton>
                                    </Flex>
                                }
                            </Group>

                            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                                <StatCard
                                    title="Horas"
                                    value={`${horasEstaSemana}h`}
                                    subtext={`de las cuales, ${horasExtraEstaSemana.toFixed(2)}h son extras`}
                                    icon={IconClock} color="blue"
                                />
                                {(rol?.includes("Presidente") || rol?.includes("admin")) && (
                                    <>
                                        <StatCard
                                            title="Total Pagar"
                                            value={`Bs. ${totalPagarBs}`}
                                            subtext={`$${totalPagarUsd}`}
                                            icon={IconCurrencyDollar} color="green"
                                        />
                                        <StatCard
                                            title="Desglose"
                                            value={`Bs. ${pagoHorasNormalesBs}`}
                                            subtext={`+ Bs. ${pagoHorasExtraBs} (Ext)`}
                                            icon={IconCurrencyDollar} color="orange"
                                        />
                                    </>
                                )}
                            </SimpleGrid>
                        </div>

                        {/* 2. BANCOS / PAGO MOVIL */}
                        <Paper withBorder radius="md" p="md">
                            <Tabs value={activeTab} onChange={setActiveTab}>
                                <Tabs.List>
                                    <Tabs.Tab value="banco" leftSection={<IconBuildingBank size={16} />}>Bancos</Tabs.Tab>
                                    <Tabs.Tab value="pagoMovil" leftSection={<IconDeviceMobile size={16} />}>Pago Móvil</Tabs.Tab>
                                </Tabs.List>

                                <Tabs.Panel value="banco" pt="md">
                                    {empleado.cuentasBancarias?.length > 0 ? (
                                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                            {empleado.cuentasBancarias.map(cuenta => (
                                                <Card key={cuenta.id} withBorder shadow="xs" padding="sm" radius="md">
                                                    <Group justify="space-between" mb="xs">
                                                        <Text fw={700}>{cuenta.nombreBanco}</Text>
                                                        <Badge variant="light">{cuenta.tipoCuenta}</Badge>
                                                    </Group>
                                                    <Text size="sm" c="dimmed">Titular: <Text span c="dark">{cuenta.titularCuenta}</Text></Text>
                                                    <Text size="sm" c="dimmed">CI: <Text span c="dark">{cuenta.cedulaCuenta}</Text></Text>
                                                    <Text size="sm" mt="xs" ff="monospace" bg="gray.1" p={4}>{cuenta.numeroCuenta}</Text>
                                                </Card>
                                            ))}
                                        </SimpleGrid>
                                    ) : <Text c="dimmed" fs="italic">Sin cuentas registradas</Text>}
                                    <Button mt="md" variant="light" size="xs" onClick={() => setModalCuenta(true)}>+ Añadir</Button>
                                </Tabs.Panel>

                                <Tabs.Panel value="pagoMovil" pt="md">
                                    {empleado.pagosMoviles?.length > 0 ? (
                                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                            {empleado.pagosMoviles.map(pm => (
                                                <Card key={pm.id} withBorder shadow="xs" padding="sm" radius="md">
                                                    <Group justify="space-between" mb="xs">
                                                        <Text fw={700}>{pm.nombreBanco}</Text>
                                                        <IconDeviceMobile size={18} color="gray" />
                                                    </Group>
                                                    <Text size="sm" c="dimmed">Titular: <Text span c="dark">{pm.titularCuenta}</Text></Text>
                                                    <Text size="sm" c="dimmed">CI: <Text span c="dark">{pm.cedulaCuenta}</Text></Text>
                                                    <Text size="lg" fw={700} mt="xs" c="blue">{pm.numeroPagoMovil}</Text>
                                                </Card>
                                            ))}
                                        </SimpleGrid>
                                    ) : <Text c="dimmed" fs="italic">Sin pago móvil</Text>}
                                    <Button mt="md" variant="light" size="xs" onClick={() => setModalPagoMovil(true)}>+ Añadir</Button>
                                </Tabs.Panel>
                            </Tabs>
                        </Paper>

                        <DocumentosManager
                            empleadoId={empleado.id}
                            documentos={empleado.documentos || []}
                            puestos={empleado.puestos || []}
                        />

                        {/* 3. HISTORIAL DE HORAS (RESPONSIVE) */}
                        <Paper withBorder radius="md" p="md">
                            <Group justify="space-between" mb="md">
                                <Title order={4}>Historial</Title>
                                <Button size="sm" onClick={() => setModalCrearHora(true)}>+ Horas</Button>
                            </Group>

                            {empleado.HorasTrabajadas?.length === 0 ? (
                                <Center p="xl" bg="gray.0" style={{ borderRadius: 8 }}>
                                    <Text c="dimmed">No hay registros.</Text>
                                </Center>
                            ) : (
                                <>
                                    {/* VISTA MÓVIL: CARDS */}
                                    {isMobile ? (
                                        <Box>
                                            {empleado.HorasTrabajadas?.map((h) => (
                                                <MobileWorkLogCard 
                                                    key={h.id} 
                                                    log={h}
                                                    // Pasamos las funciones de editar y borrar
                                                    onEdit={() => {
                                                        setSelectedHora(h);
                                                        setModalCrearHora(true);
                                                    }}
                                                    onDelete={() => handleDeleteHora(h.id)}
                                                />
                                            ))}
                                        </Box>
                                    ) : (
                                        /* VISTA DESKTOP: TABLE */
                                        <ScrollArea h={300} type="auto">
                                            <Table striped highlightOnHover verticalSpacing="xs">
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th>Fecha</Table.Th>
                                                        <Table.Th>Horas</Table.Th>
                                                        <Table.Th>Origen</Table.Th>
                                                        <Table.Th>Observaciones</Table.Th>
                                                        <Table.Th>Acciones</Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {empleado.HorasTrabajadas?.map((h) => (
                                                        <Table.Tr key={h.id}>
                                                            <Table.Td style={{ whiteSpace: 'nowrap' }}>
                                                                {formatDateLong(h.fecha)}
                                                            </Table.Td>
                                                            <Table.Td>
                                                                <Badge color={h.horas > 8 ? 'orange' : 'blue'} variant="light">
                                                                    {h.horas}
                                                                </Badge>
                                                            </Table.Td>
                                                            <Table.Td>
                                                                {h.origen === "odt" ? (
                                                                    <Link href={`/superuser/odt/${h.odtId}`} style={{ textDecoration: 'none', color: '#228be6', fontWeight: 500 }}>
                                                                        {h.observaciones.match(/ODT\s+#(\d+)/)?.[0] || 'ODT'}
                                                                    </Link>
                                                                ) : (
                                                                    <Badge variant="outline" color="gray" size="sm">{h.origen}</Badge>
                                                                )}
                                                            </Table.Td>
                                                            <Table.Td style={{ minWidth: 200 }}>
                                                                <Text size="sm" lineClamp={2}>{h.observaciones}</Text>
                                                            </Table.Td>
                                                            <Table.Td>
                                                                {/* Aquí puedes agregar botones de acción si es necesario */}
                                                                <ActionIcon size="sm" variant="light" color="red" onClick={() => { handleDeleteHora(h.id) }}>
                                                                    <IconTrash size={16} />
                                                                </ActionIcon>
                                                                <ActionIcon size="sm" variant="light" color="blue" onClick={() => {
                                                                    setSelectedHora(h);
                                                                    setModalCrearHora(true)
                                                                }}>
                                                                    <IconEdit size={16} />
                                                                </ActionIcon>

                                                            </Table.Td>
                                                        </Table.Tr>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </ScrollArea>
                                    )}
                                </>
                            )}
                        </Paper>

                    </Stack>
                </Grid.Col>
            </Grid>

            {/* Modales */}
            <ModalCrearHora
                initialValues={selectedHora}
                opened={modalCrearHora}
                onClose={(e) => {
                    setModalCrearHora(false)
                    setSelectedHora(null);
                    e && setEmpleado(prev => ({
                        ...prev,
                        HorasTrabajadas: [...prev.HorasTrabajadas, e]
                    }))
                }
                }
                empleadoId={id}
                onCreated={() => router.refresh()} />
            <ModalCuentaBancaria opened={modalCuenta} onClose={() => setModalCuenta(false)} tipoEntidad="empleado" entidadId={id} onCreated={() => router.refresh()} />
            <ModalPagoMovil opened={modalPagoMovil} onClose={() => setModalPagoMovil(false)} tipoEntidad="empleado" entidadId={id} onCreated={() => router.refresh()} />
        </Paper>
    )
}