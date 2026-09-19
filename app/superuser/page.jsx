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
    IconBuildingStore,
    IconReceipt,
    IconShieldCheck
} from '@tabler/icons-react';
import './superuser.css';
import { useAuth } from '@/hooks/useAuth';
import DashboardTareas from '../components/DashboardTareas';
import { notifications } from '@mantine/notifications';
import dynamic from 'next/dynamic';

const PanelInicio = dynamic(() => import('./_components/PanelInicio'), { ssr: false });
const DashboardVendedor = dynamic(() => import('./_components/DashboardVendedor'), { ssr: false });
const PosModal = dynamic(() => import('../components/admin/PosModal'), { ssr: false });
const CompraModal = dynamic(() => import('../components/admin/CompraModal'), { ssr: false }); // 🔥 IMPORTAMOS EL MODAL DE COMPRAS 🔥


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
    { title: 'Compras', href: '/superuser/compras', description: 'Gestión de compras y proveedores.', icon: IconPackage, color: 'orange' },
    { title: 'Balance General', href: '/superuser/finanzas', description: 'Dashboard de ingresos y egresos.', icon: IconCurrencyDollar, color: 'grape' },
    { title: 'Cuentas por Cobrar (CxC)', href: '/superuser/cxc', description: 'Gestión de cuentas por cobrar.', icon: IconShieldCheck, color: 'green' },
    { title: 'Cuentas por Pagar (CxP)', href: '/superuser/cxp', description: 'Gestión de cuentas por pagar.', icon: IconAlertTriangle, color: 'red' },
    { title: 'Pagos Moviles recibidos', href: '/superuser/pagos-recibidos', description: 'Gestión de pagos móviles recibidos.', icon: IconCurrencyDollar, color: 'blue' },
];

// Permisos que no son una pantalla del menú, pero se administran en el mismo panel de Control de Accesos.
// Los administradores siempre pueden; el resto, solo si su usuario, puesto o departamento está aquí.
// (El servidor lo valida en app/api/inventario/_lib.js con la misma clave.)
const permisosExtra = [
    { title: 'Inventario · edición tipo hoja de cálculo', href: 'inventario:editar', description: 'Editar stock, costos y precios directamente en la hoja de inventario.', icon: IconArchive, color: 'teal' },
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

// El vendedor tiene su propio panel (tareas, ventas, compras, inventario); el resto del personal ve el panel administrativo.
export default function SuperUserHome() {
    const { esVendedor, loading } = useAuth();
    if (loading) return <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader size="sm" type="dots" /></Box>;
    return esVendedor ? <DashboardVendedor /> : <PanelAdministrativo />;
}

function PanelAdministrativo() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const { isAdmin, departamentos, departamento, rol, userId, nombre } = useAuth();

    const [precioBCV, setPrecioBCV] = useState(0);
    const [modalAbierto, setModalAbierto] = useState(false);
    const [permisosDinamicos, setPermisosDinamicos] = useState({});

    const [departamentosList, setDepartamentosList] = useState([]);
    const [puestosList, setPuestosList] = useState([]);
    const [usuariosList, setUsuariosList] = useState([]);

    const [pendientesFirma, setPendientesFirma] = useState([]);
    const [procesandoFirma, setProcesandoFirma] = useState(false);
    const [modalRechazo, setModalRechazo] = useState(false);
    const [selectedItemFirma, setSelectedItemFirma] = useState(null);
    const [motivoRechazo, setMotivoRechazo] = useState('');

    const [modalPosAbierto, setModalPosAbierto] = useState(false);
    const [modalCompraAbierto, setModalCompraAbierto] = useState(false); // 🔥 ESTADO PARA EL MODAL DE COMPRAS 🔥

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
                    setDepartamentosList(dataDepartamentos.filter(d => d && d.nombre).map(d => String(d.nombre)));
                }

                if (resPuestos.ok) {
                    const dataPuestos = await resPuestos.json();
                    setPuestosList(dataPuestos.filter(p => p && p.nombre).map(p => String(p.nombre)));
                }

                if (resUsuarios.ok) {
                    const dataUsuarios = await resUsuarios.json();
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

    useEffect(() => {
        const fetchPendientes = async () => {
            if (!userId) return;
            try {
                const res = await fetch(`/api/inventario/salidas`);
                if (res.ok) {
                    const data = await res.json();
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

        const tieneDepartamento = depsPermitidos.some(dep =>
            dep && typeof dep === 'string' && userDepsArray.some(d => d && typeof d === 'string' && d.toLowerCase().includes(dep.toLowerCase()))
        );

        const tienePuesto = puestosPermitidos.some(puesto =>
            puesto && typeof puesto === 'string' && userRolArray.some(r => r && typeof r === 'string' && r.toLowerCase().includes(puesto.toLowerCase()))
        );

        const tieneUsuario = usuariosPermitidos.includes(String(userId));

        return tieneDepartamento || tienePuesto || tieneUsuario;
    };

    const opcionesVisibles = menuOptions.filter(option => puedeVerModulo(option.href));

    if (isLoading) {
        return (
            <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <Loader size="sm" type="dots" color="blue" />
            </Box>
        );
    }

    return (
        <Box>
            <Box maw={1600} mx="auto" px="md" pt="sm">

                <Modal opened={modalAbierto} onClose={() => setModalAbierto(false)} title={<Text fw={700} size="md">Control de Accesos</Text>} size="xl">
                    <Stack gap="xs">
                        <Box style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '5px' }}>
                            {[...menuOptions, ...permisosExtra].map((opt) => (
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

                {modalPosAbierto && (
                    <PosModal
                        opened={modalPosAbierto}
                        onClose={() => setModalPosAbierto(false)}
                        tasaBcv={precioBCV}
                    />
                )}

                {/* 🔥 MODAL DE REGISTRO DE FACTURA DE COMPRA 🔥 */}
                {modalCompraAbierto && (
                    <CompraModal
                        opened={modalCompraAbierto}
                        onClose={() => setModalCompraAbierto(false)}
                        tasaBcv={precioBCV}
                    />
                )}

                <PanelInicio
                    nombre={nombre}
                    tasa={precioBCV}
                    onPos={() => setModalPosAbierto(true)}
                    onCompra={() => setModalCompraAbierto(true)}
                    onAjustes={userId === 1 ? () => setModalAbierto(true) : null}
                    modulos={opcionesVisibles}
                    tareas={<DashboardTareas glassStyle={{ border: 'none', background: 'transparent', boxShadow: 'none' }} />}
                />
            </Box>
        </Box>
    );
}