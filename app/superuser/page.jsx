'use client';

import {
    Title, Stack, Box, Text, Flex, Loader, Paper, UnstyledButton, Group,
    ThemeIcon, Card, SimpleGrid, Button, Modal, MultiSelect, ActionIcon, Grid, Badge,
    Alert, Textarea
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import {
    IconArchive, IconUser,
    IconShoppingCart,
    IconAlertTriangle,
    IconSettings, IconCurrencyDollar, IconCheck,
    IconPackage,
    IconBuildingStore
} from '@tabler/icons-react';
import './superuser.css';
import { useAuth } from '@/hooks/useAuth';
import DashboardTareas from '../components/DashboardTareas';
import { notifications } from '@mantine/notifications';
import dynamic from 'next/dynamic';
const PosModal = dynamic(() => import('../components/admin/PosModal'), { ssr: false });

// --- CONSTANTES DE DISEÑO ---
const bgPattern = {
    backgroundColor: '#7f9bb854',
    backgroundImage: 'radial-gradient(#E5E7EB 1.5px, transparent 1.5px)',
    backgroundSize: '24px 24px',
    minHeight: '100vh',
    paddingBottom: '20px'
};

const glassCardStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    border: '1px solid rgba(226, 232, 240, 0.8)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
    transition: 'all 0.2s ease',
};

const menuOptions = [
    { title: 'Clientes', href: '/superuser/clientes', description: 'Gestión de clientes', icon: IconUser, color: 'green' },
    { title: 'Inventario', href: '/superuser/inventario', description: 'Control almacén.', icon: IconArchive, color: 'indigo' },
    { title: 'Personal', href: '/superuser/rrhh', description: 'RRHH y empleados.', icon: IconUser, color: 'cyan' },
    { title: 'Ventas / Pedidos', href: '/superuser/ventas', description: 'Gestión de ventas de diario y pedidos.', icon: IconShoppingCart, color: 'grape' },
    { title: 'Finanzas', href: '/superuser/finanzas', description: 'Gestión de finanzas.', icon: IconCurrencyDollar, color: 'grape' },
];

const FadeInSection = ({ children, delay = 0 }) => {
    const [isVisible, setVisible] = useState(false);
    const domRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        const currentElement = domRef.current;
        if (currentElement) observer.observe(currentElement);
        return () => { if (currentElement) observer.unobserve(currentElement); };
    }, []);

    return (
        <div ref={domRef} style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
            transition: `opacity 0.3s ease-out ${delay}s, transform 0.3s ease-out ${delay}s`,
            width: '100%',
            height: '100%'
        }}>
            {children}
        </div>
    );
};

export default function SuperUserHome() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const { isAdmin, departamentos, departamento, rol, userId } = useAuth();

    const [precioBCV, setPrecioBCV] = useState(0);
    const [modalAbierto, setModalAbierto] = useState(false);
    const [permisosDinamicos, setPermisosDinamicos] = useState({});

    const [departamentosList, setDepartamentosList] = useState([]);
    const [puestosList, setPuestosList] = useState([]);
    const [usuariosList, setUsuariosList] = useState([]);

    // 🔥 NUEVOS ESTADOS PARA FIRMA DE CUSTODIA 🔥
    const [pendientesFirma, setPendientesFirma] = useState([]);
    const [procesandoFirma, setProcesandoFirma] = useState(false);
    const [modalRechazo, setModalRechazo] = useState(false);
    const [selectedItemFirma, setSelectedItemFirma] = useState(null);
    const [motivoRechazo, setMotivoRechazo] = useState('');

    const [modalPosAbierto, setModalPosAbierto] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [resBCV, resPermisos, resDepartamentos, resPuestos, resUsuarios] = await Promise.all([
                    fetch('/api/bcv'),
                    fetch('/api/superuser/permissions'),
                    fetch('/api/rrhh/departamentos'),
                    fetch('/api/rrhh/puestos'),
                    fetch('/api/users')
                ]);

                if (resBCV.ok) {
                    const dataBCV = await resBCV.json();
                    setPrecioBCV(dataBCV.precio);
                }

                if (resPermisos.ok) {
                    const dataPermisos = await resPermisos.json();
                    setPermisosDinamicos(dataPermisos);
                }

                if (resDepartamentos.ok) {
                    const dataDepartamentos = await resDepartamentos.json();
                    // Filtramos para asegurar que no entren nulos
                    setDepartamentosList(dataDepartamentos.filter(d => d && d.nombre).map(d => String(d.nombre)));
                }

                if (resPuestos.ok) {
                    const dataPuestos = await resPuestos.json();
                    // Filtramos para asegurar que no entren nulos
                    setPuestosList(dataPuestos.filter(p => p && p.nombre).map(p => String(p.nombre)));
                }

                if (resUsuarios.ok) {
                    const dataUsuarios = await resUsuarios.json();
                    // Almacenamos el ID como string y el nombre como etiqueta legible
                    setUsuariosList(dataUsuarios.filter(u => u && u.id && u.empleado).map(u => ({ value: String(u.id), label: `${u.empleado.nombre} ${u.empleado.apellido}` })));
                }

            } catch (error) {
                console.error("Error al cargar datos iniciales:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    // 🔥 EFECTO PARA BUSCAR MATERIALES PENDIENTES DEL USUARIO LOGUEADO 🔥
    useEffect(() => {
        const fetchPendientes = async () => {
            if (!userId) return;
            try {
                const res = await fetch(`/api/inventario/salidas`);
                if (res.ok) {
                    const data = await res.json();
                    // Filtramos las salidas que están esperando firma Y que le pertenecen a este usuario
                    const misPendientes = data.filter(s => s.estado === 'Esperando Firma' && s.solicitadoPorId === userId);
                    setPendientesFirma(misPendientes);
                }
            } catch (error) {
                console.error("Error cargando firmas pendientes", error);
            }
        };
        fetchPendientes();
    }, [userId]);

    const guardarPermisos = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/superuser/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(permisosDinamicos)
            });

            if (res.ok) {
                notifications.show({ title: 'Éxito', message: 'Permisos guardados.', color: 'teal' });
                setModalAbierto(false);
            } else {
                throw new Error();
            }
        } catch (error) {
            notifications.show({ title: 'Error', message: 'Fallo al guardar.', color: 'red' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleHover = (e, lift) => {
        e.currentTarget.style.transform = lift ? 'translateY(-2px)' : 'translateY(0)';
        e.currentTarget.style.boxShadow = lift
            ? '0 6px 12px rgba(0, 0, 0, 0.05)'
            : '0 2px 6px rgba(0, 0, 0, 0.02)';
        e.currentTarget.style.borderColor = lift ? 'rgba(51, 154, 240, 0.5)' : 'rgba(226, 232, 240, 0.8)';
    };

    const puedeVerModulo = (href) => {
        if (isAdmin) return true;
        const configModulo = permisosDinamicos[href] || { departamentos: [], puestos: [], usuarios: [] };
        const depsPermitidos = configModulo.departamentos || [];
        const puestosPermitidos = configModulo.puestos || [];
        const usuariosPermitidos = configModulo.usuarios || [];

        const userDeptValue = departamentos || departamento;
        const userDepsArray = Array.isArray(userDeptValue)
            ? userDeptValue
            : (typeof userDeptValue === 'string' ? [userDeptValue] : []);

        const userRolArray = Array.isArray(rol)
            ? rol
            : (typeof rol === 'string' ? [rol] : []);

        // Añadida validación de tipo para evitar errores de undefined en toLowerCase
        const tieneDepartamento = depsPermitidos.some(dep =>
            dep && typeof dep === 'string' && userDepsArray.some(d => d && typeof d === 'string' && d.toLowerCase().includes(dep.toLowerCase()))
        );

        // Añadida validación de tipo para evitar errores de undefined en toLowerCase
        const tienePuesto = puestosPermitidos.some(puesto =>
            puesto && typeof puesto === 'string' && userRolArray.some(r => r && typeof r === 'string' && r.toLowerCase().includes(puesto.toLowerCase()))
        );

        // Validación por ID específico de usuario
        const tieneUsuario = usuariosPermitidos.includes(String(userId));

        return tieneDepartamento || tienePuesto || tieneUsuario;
    };

    const opcionesVisibles = menuOptions.filter(option => puedeVerModulo(option.href));

    // 🔥 FUNCIÓN PARA CONFIRMAR O RECHAZAR EL MATERIAL DESDE EL DASHBOARD 🔥
    const handleFirmar = async (id, accion) => {
        if (accion === 'Rechazar' && !motivoRechazo) return notifications.show({ message: 'Escribe un motivo de rechazo', color: 'orange' });

        setProcesandoFirma(true);
        try {
            const res = await fetch(`/api/inventario/salidas/${id}/firmar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion, motivoRechazo })
            });

            if (res.ok) {
                notifications.show({ title: 'Acta Digital Cerrada', message: `Material ${accion.toLowerCase()}o correctamente.`, color: 'teal' });
                setModalRechazo(false);
                setMotivoRechazo('');
                // Quitamos el item de la vista localmente para que desaparezca al instante
                setPendientesFirma(prev => prev.filter(item => item.id !== id));
            } else {
                const err = await res.json();
                throw new Error(err.error);
            }
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setProcesandoFirma(false);
        }
    };

    if (isLoading) {
        return (
            <Box style={{ ...bgPattern, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <Loader size="sm" type="dots" color="blue" />
            </Box>
        );
    }

    return (
        <Box style={bgPattern}>
            <Box maw={1600} mx="auto" px="md" pt="sm">

                <Modal opened={modalAbierto} onClose={() => setModalAbierto(false)} title={<Text fw={700} size="md">Control de Accesos</Text>} size="xl">
                    <Stack gap="xs">
                        <Box style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '5px' }}>
                            {menuOptions.map((opt) => (
                                <Paper key={opt.href} withBorder p="xs" radius="sm" mb="xs" bg="gray.0">
                                    <Group mb="xs" gap="xs">
                                        <ThemeIcon size="sm" variant="light" color={opt.color}><opt.icon size={14} /></ThemeIcon>
                                        <Text fw={600} size="sm">{opt.title}</Text>
                                    </Group>
                                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                                        <MultiSelect size="xs" label="Departamentos" data={departamentosList} value={permisosDinamicos[opt.href]?.departamentos || []} onChange={(val) => setPermisosDinamicos({ ...permisosDinamicos, [opt.href]: { ...(permisosDinamicos[opt.href] || {}), departamentos: val } })} placeholder="Bloqueado" searchable clearable />
                                        <MultiSelect size="xs" label="Puestos" data={puestosList} value={permisosDinamicos[opt.href]?.puestos || []} onChange={(val) => setPermisosDinamicos({ ...permisosDinamicos, [opt.href]: { ...(permisosDinamicos[opt.href] || {}), puestos: val } })} placeholder="Bloqueado" searchable clearable />
                                        <MultiSelect size="xs" label="Usuarios específicos" data={usuariosList} value={permisosDinamicos[opt.href]?.usuarios || []} onChange={(val) => setPermisosDinamicos({ ...permisosDinamicos, [opt.href]: { ...(permisosDinamicos[opt.href] || {}), usuarios: val } })} placeholder="Bloqueado" searchable clearable />
                                    </SimpleGrid>
                                </Paper>
                            ))}
                        </Box>
                        <Button loading={isSaving} color="blue" fullWidth mt="xs" onClick={guardarPermisos}>Guardar Configuración</Button>
                    </Stack>
                </Modal>

                {/* MODAL DE RECHAZO DE FIRMA */}
                <Modal opened={modalRechazo} onClose={() => setModalRechazo(false)} title="Rechazar Recepción de Material" centered>
                    <Textarea
                        label="¿Por qué no aceptas este material?"
                        description="Este mensaje será enviado a gerencia y almacén de forma inmediata."
                        placeholder="Ej: La pieza está rota, me entregaron el repuesto equivocado..."
                        value={motivoRechazo}
                        onChange={(e) => setMotivoRechazo(e.currentTarget.value)}
                        required
                    />
                    <Button fullWidth color="red" mt="md" onClick={() => handleFirmar(selectedItemFirma?.id, 'Rechazar')} loading={procesandoFirma}>
                        Confirmar Rechazo
                    </Button>
                </Modal>

                {modalPosAbierto && (
                    <PosModal
                        opened={modalPosAbierto}
                        onClose={() => setModalPosAbierto(false)}
                        tasaBcv={precioBCV}
                    />
                )}

                {/* --- CABECERA COMPACTA --- */}
                <FadeInSection>
                    <Group justify="space-between" align="center" mb="md">
                        <Group gap="sm" align="center">
                            <Title order={5} fw={800} c="dark.8" tt="uppercase" lts={1}>
                                DASHBOARD OPERATIVO
                            </Title>

                            <Badge component={Link} href="/superuser/bcv" size="lg" variant="filled" color="teal.6" radius="sm" leftSection={<IconCurrencyDollar size={14} />} style={{ cursor: 'pointer', textTransform: 'none' }}>
                                BCV Oficial: {precioBCV ? `${precioBCV} Bs.` : "Cargando..."}
                            </Badge>

                            {userId === 1 && (
                                <ActionIcon variant="light" color="gray" size="sm" radius="md" onClick={() => setModalAbierto(true)}>
                                    <IconSettings size={16} />
                                </ActionIcon>
                            )}
                        </Group>
                        <Button
                            size="lg"
                            color="blue.9"
                            leftSection={<IconBuildingStore size={22} />}
                            onClick={() => setModalPosAbierto(true)}
                        >
                            Registrar Venta Rápida (POS)
                        </Button>
                    </Group>
                </FadeInSection>

                {/* --- CUERPO PRINCIPAL --- */}
                <Grid gutter="md" align="flex-start">

                    {/* COLUMNA IZQUIERDA: Módulos */}
                    <Grid.Col span={{ base: 12, lg: 5, xl: 6 }}>
                        <Title order={6} mb="xs" c="gray.5" tt="uppercase" fz={11} lts={1}>Accesos Directos</Title>
                        <SimpleGrid cols={{ base: 2, sm: 2, md: 2, lg: 2, xl: 3 }} spacing="xs">
                            {opcionesVisibles.map((option, index) => (
                                <FadeInSection key={option.href} delay={index * 0.02}>
                                    <UnstyledButton component={Link} href={option.href} style={{ width: '100%', height: '100%', display: 'block' }}>
                                        <Card p="xs" radius="md" style={glassCardStyle} onMouseEnter={(e) => handleHover(e, true)} onMouseLeave={(e) => handleHover(e, false)} h="100%">
                                            <Group align="center" wrap="nowrap" gap="xs">
                                                <ThemeIcon size={32} radius="md" variant="light" color={option.color}>
                                                    <option.icon size={18} stroke={1.5} />
                                                </ThemeIcon>
                                                <Box style={{ flex: 1, minWidth: 0 }}>
                                                    <Text fw={700} size="sm" c="dark.8" truncate>{option.title}</Text>
                                                    <Text size={10} c="dimmed" truncate lh={1.1}>{option.description}</Text>
                                                </Box>
                                            </Group>
                                        </Card>
                                    </UnstyledButton>
                                </FadeInSection>
                            ))}
                        </SimpleGrid>
                    </Grid.Col>

                    {/* COLUMNA DERECHA: Tareas */}
                    <Grid.Col span={{ base: 12, lg: 7, xl: 6 }}>
                        <FadeInSection delay={0.1}>
                            <Title order={6} mb="xs" c="gray.5" tt="uppercase" fz={11} lts={1}>Centro de Tareas</Title>
                            <Box style={glassCardStyle} radius="md" bg="white" h="100%">
                                <DashboardTareas glassStyle={{ border: 'none', background: 'transparent', boxShadow: 'none' }} />
                            </Box>
                        </FadeInSection>
                    </Grid.Col>

                </Grid>
            </Box>
        </Box>
    );
}