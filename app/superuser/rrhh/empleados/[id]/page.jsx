"use client"

import React, { useEffect, useState } from "react"
import {
    Paper, Grid, Title, Text, Group, Button,
    Center, Loader, Stack, Badge,
    Flex, SimpleGrid, Card, Avatar, Divider,
    ThemeIcon, ActionIcon,
    UnstyledButton
} from "@mantine/core"
import { useParams, useRouter } from "next/navigation"
import {
    IconEdit, IconPhone, IconId, IconCake,
    IconBriefcase,
    IconCalendar,
    IconShirt, IconShoe, IconHanger, IconRuler2,
    IconChevronLeft
} from "@tabler/icons-react";
import { useAuth } from "@/hooks/useAuth";
import { useMediaQuery } from "@mantine/hooks"; // <--- IMPORTANTE
import calcularEdad from "@/app/helpers/calcularEdad";

// Modales
import DocumentosManager from "../../components/DocumentosManager";
import { formatDateLong } from "@/app/helpers/dateUtils";


export default function Page({ params }) {
    const { id } = useParams(params);
    const router = useRouter();
    const [error, setError] = useState(null);

    // Detectar Móvil
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Estados de Datos
    const [empleado, setEmpleado] = useState(null)
    const [cargando, setCargando] = useState(true);


    // Estados de UI
    const { rol } = useAuth();
    const [activeTab, setActiveTab] = useState('banco');


    useEffect(() => {
        let mounted = true
        async function cargar() {
            try {
                const res = fetch(`/api/rrhh/empleados/${id}`).then(r => r.json())

                const empleadofetched = await res;

                if (!mounted) return;

                setEmpleado({
                    ...empleadofetched,
                    edad: calcularEdad(empleadofetched.fechaNacimiento),

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

                          
                        </Stack>
                    </Card>
                </Grid.Col>

                {/* --- COLUMNA DERECHA: DASHBOARD --- */}
                <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
                    <Stack gap="lg">



                        <DocumentosManager
                            empleadoId={empleado.id}
                            documentos={empleado.documentos || []}
                            puestos={empleado.puestos || []}
                        />



                    </Stack>
                </Grid.Col>
            </Grid>

        </Paper>
    )
}