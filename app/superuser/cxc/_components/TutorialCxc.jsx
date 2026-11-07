'use client';

// Tutorial de Cuentas por cobrar: explica cómo hacer todo en cada pestaña (libro, vendedores, resumen y el uso en el teléfono).
// Se abre solo la primera vez; la casilla «No volver a mostrar» se recuerda en este navegador (localStorage, con try/catch:
// si el navegador no deja guardar, la página funciona igual y el tutorial simplemente vuelve a aparecer).
// Siempre se puede reabrir con el botón «¿Cómo se usa?» del encabezado. Cambiar LLAVE_TUTORIAL (p. ej. «-v2») lo vuelve a mostrar a todos.
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Group, List, Modal, SimpleGrid, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import {
    IconArrowLeft, IconArrowRight, IconChartBar, IconCircleCheck, IconCoin, IconDeviceMobile, IconHourglass, IconInfoCircle, IconListCheck,
    IconPercentage, IconPlus, IconReceipt, IconSearch, IconTable, IconUsers,
} from '@tabler/icons-react';
import { LeyendaColores } from './PiezasVendedores';
import { guardarLocal, leerLocal, useEsTelefono } from './utilidades';
import classes from './cxc.module.css';

export const LLAVE_TUTORIAL = 'mq:tutorial:cxc-v1';
export const tutorialYaVisto = () => leerLocal(LLAVE_TUTORIAL) === '1';

const Item = ({ children }) => <List.Item><Text size="sm" component="span">{children}</Text></List.Item>;
const Lista = ({ children }) => <List spacing={6} size="sm" c="#1a1b1e">{children}</List>;

const SECCIONES = [
    {
        valor: 'libro', titulo: 'Libro de cobranza', icono: IconTable,
        pasos: [
            {
                titulo: 'Cómo se lee el libro', icono: IconTable, color: 'navy',
                contenido: (
                    <Lista>
                        <Item>Cada <b>cliente</b> es un renglón azul con lo que debe en total. Debajo van sus <b>documentos</b>: facturas, notas de entrega y cuentas manuales.</Item>
                        <Item><b>Monto</b> = lo que se facturó · <b>Abonado</b> = lo que ya pagó · <b>Saldo</b> = lo que todavía debe.</Item>
                        <Item>En <b>rojo</b>, con «Vencida +N d»: ya pasó la fecha de pago (dice cuántos días). En naranja, lo que vence en una semana o menos.</Item>
                        <Item>Arriba están los totales: <b>Por cobrar</b>, <b>Vencido</b> (tócalo para ver solo lo vencido), documentos y clientes.</Item>
                    </Lista>
                ),
            },
            {
                titulo: 'Registrar un abono (el cliente pagó)', icono: IconCoin, color: 'teal',
                contenido: (
                    <Lista>
                        <Item>Toca el botón verde <b>«Abonar»</b> del documento. Escribe el monto (<b>TODO</b> pone el saldo completo), la fecha, cómo pagó y la referencia.</Item>
                        <Item>Atajo en la computadora: escribe el <b>saldo nuevo</b> en la celda «Saldo» y el sistema calcula el abono por ti; solo confirmas.</Item>
                        <Item>Para ver, corregir o borrar abonos: la flecha <b>▸</b> a la izquierda del documento (en el teléfono, el botón «N abonos»).</Item>
                    </Lista>
                ),
            },
            {
                titulo: 'Ajustar la deuda o corregir un documento', icono: IconReceipt, color: 'orange',
                contenido: (
                    <Lista>
                        <Item>Si la deuda <b>sube</b> (un cargo, un error a favor del cliente…): <b>⋯ → «Ajustar la deuda»</b>. Queda registrado como ajuste.</Item>
                        <Item>Si el documento se cargó con un <b>monto equivocado</b>: clic en la celda «Monto» (o ⋯ → «Corregir el monto»). Pide el motivo y lo anota en la observación.</Item>
                        <Item><b>Vencimiento</b> y <b>observación</b>: clic en la celda, <b>Enter</b> guarda y <b>Esc</b> cancela (en el teléfono: ⋯ → «Cambiar vencimiento u observación»).</Item>
                        <Item>La deuda nunca se cambia a escondidas: todo cambio queda como abono o ajuste, con su fecha.</Item>
                    </Lista>
                ),
            },
            {
                titulo: 'Cuentas manuales (préstamos y deudas sin factura)', icono: IconPlus, color: 'grape',
                contenido: (
                    <Lista>
                        <Item><b>«Nueva cuenta manual»</b>: a quién se le cobra, concepto (DEUDA, PRÉSTAMO…), monto, fecha y vencimiento.</Item>
                        <Item>Llevan la etiqueta morada <b>«Manual»</b> y se cobran con abonos igual que una factura. No tocan los libros ni las ventas.</Item>
                        <Item>Si se creó por error y no tiene abonos: <b>⋯ → «Borrar esta cuenta manual»</b>.</Item>
                    </Lista>
                ),
            },
            {
                titulo: 'Buscar, filtrar, ordenar y exportar', icono: IconSearch, color: 'blue',
                contenido: (
                    <Lista>
                        <Item>El <b>buscador</b> encuentra por cliente, documento, RIF, vendedor u observación.</Item>
                        <Item><b>Por cobrar</b> (lo pendiente) · <b>Vencidas</b> · <b>Todas</b> (incluye las ya cobradas, en gris con «Cobrada»).</Item>
                        <Item><b>Ordenar</b>: por cliente, por mayor deuda o por lo más vencido.</Item>
                        <Item><b>«Excel (CSV)»</b> descarga exactamente lo que estás viendo, para abrirlo en Excel.</Item>
                    </Lista>
                ),
            },
        ],
    },
    {
        valor: 'vendedores', titulo: 'Vendedores a comisión', icono: IconUsers,
        pasos: [
            {
                titulo: 'La hoja de cada vendedor', icono: IconUsers, color: 'navy',
                contenido: (
                    <Lista>
                        <Item>Elige el <b>vendedor</b> arriba: el elegido se ve en azul con letra blanca.</Item>
                        <Item>Las cifras de arriba: <b>Comisión por pagar</b> (lo que ya se le debe), <b>Por generar</b>, <b>Pagada</b>, lo que <b>los clientes deben</b>, lo <b>a comisionar sin IVA</b> y la <b>tasa BCV de hoy</b>.</Item>
                        <Item>El <b>% por defecto</b> del vendedor se propone al agregar sus facturas; cada factura puede tener el suyo.</Item>
                    </Lista>
                ),
            },
            {
                titulo: 'Qué significa cada color', icono: IconInfoCircle, color: 'yellow',
                contenido: (
                    <Stack gap="sm">
                        <Box p="xs" style={{ border: '1px solid #e1e6ee', borderRadius: 8 }}><LeyendaColores /></Box>
                        <Lista>
                            <Item><b>Amarillo</b>: el cliente ya pagó y la comisión está <b>por pagar</b> al vendedor. Se pone amarillo solo, en cuanto se registra el pago.</Item>
                            <Item><b>Gris</b>: la comisión ya se le pagó.</Item>
                            <Item><b>Blanco</b>: la factura no se ha cobrado; su comisión todavía no se puede pagar.</Item>
                            <Item>Cada renglón también lo dice con palabras: «Por pagar», «Pagada 05/11/26», «Sin cobrar», «En sus abonos».</Item>
                        </Lista>
                    </Stack>
                ),
            },
            {
                titulo: 'Clientes, facturas y abonos', icono: IconListCheck, color: 'blue',
                contenido: (
                    <Lista>
                        <Item>Cada <b>cliente</b> se despliega con un toque. Su encabezado resume: debe, facturas (con IVA), abonado, a comisionar sin IVA, comisión, por pagar y por generar (con su valor en Bs).</Item>
                        <Item>Dentro, cada <b>factura</b> es el renglón principal y sus <b>abonos</b> van debajo con <b>└</b>, más pequeños (la flecha ▾ los esconde).</Item>
                        <Item>Los abonos se ven en positivo, en la columna «Abono / pago». <b>Cada abono genera su comisión</b> sobre la parte sin IVA de lo abonado.</Item>
                        <Item>Si una factura tiene abonos, su comisión es solo la <b>posible</b> (en gris): no se suma como deuda.</Item>
                        <Item>«Debe $x» o «Cobrada» junto al número dice cómo va el cobro de esa factura en el sistema. El ícono de enlace roto avisa que no está enlazada con una factura del sistema.</Item>
                    </Lista>
                ),
            },
            {
                titulo: 'Cambiar el porcentaje', icono: IconPercentage, color: 'indigo',
                contenido: (
                    <Lista>
                        <Item>El porcentaje se cambia <b>solo en la factura</b>: de <b>2 % a 10 %</b>, de medio en medio (clic en la celda «%» o «Editar»).</Item>
                        <Item>Al cambiarlo, sus <b>abonos por pagar</b> toman el nuevo % y recalculan su comisión. Los ya pagados no cambian.</Item>
                        <Item>Si cambias «A comisionar sin IVA», la comisión también se recalcula sola.</Item>
                    </Lista>
                ),
            },
            {
                titulo: '«Por pagar», «por generar» y la comisión en Bs', icono: IconHourglass, color: 'gray',
                contenido: (
                    <Lista>
                        <Item><b>Por pagar</b>: el cliente ya pagó (la factura completa o un abono) y al vendedor aún no se le paga. Es lo que se le debe hoy.</Item>
                        <Item><b>Por generar (sin cobrar)</b>: lo que dejarán las facturas que el cliente todavía no paga. Aún no se le debe.</Item>
                        <Item>La comisión se paga en <b>bolívares a la tasa BCV del día</b>: cada cifra muestra también su valor en Bs y se recalcula sola cuando cambia la tasa. Si no hay tasa registrada, se ve solo en dólares.</Item>
                    </Lista>
                ),
            },
            {
                titulo: 'Pagarle las comisiones al vendedor', icono: IconCircleCheck, color: 'teal',
                contenido: (
                    <Lista>
                        <Item>Deja el filtro en <b>«Por pagar»</b> (ya viene así).</Item>
                        <Item><b>«Seleccionar por pagar»</b> marca todas las amarillas que se ven (o marca las casillas una por una).</Item>
                        <Item>Aparece cuántas son y el <b>total en $ y en Bs</b>: es lo que hay que pagarle.</Item>
                        <Item><b>«Marcar pagadas»</b> → confirma → quedan en gris con la fecha de hoy. ¿Te equivocaste? Selecciónalas y <b>«Marcar pendientes»</b>, o toca el estado de una sola línea.</Item>
                    </Lista>
                ),
            },
            {
                titulo: 'Agregar facturas y abonos', icono: IconPlus, color: 'navy',
                contenido: (
                    <Lista>
                        <Item><b>«Agregar línea»</b>: una <b>factura</b> (número, cliente, monto con IVA, monto sin IVA y %) o un <b>abono / pago</b> (número de su factura y lo abonado).</Item>
                        <Item>Desde una factura: <b>⋯ → «Agregar un abono a esta factura»</b> (el número, el cliente y el % se llenan solos).</Item>
                        <Item>Si el número coincide con una factura del sistema, queda <b>enlazada</b> y su cobro se sigue solo.</Item>
                        <Item>Para corregir cualquier dato: clic en la celda, o <b>⋯ → «Editar esta línea»</b>.</Item>
                    </Lista>
                ),
            },
        ],
    },
    {
        valor: 'resumen', titulo: 'Resumen y antigüedad', icono: IconChartBar,
        pasos: [
            {
                titulo: 'Resumen y antigüedad de la deuda', icono: IconChartBar, color: 'blue',
                contenido: (
                    <Lista>
                        <Item>Totales: lo <b>pendiente</b> (también en Bs), lo <b>vencido</b>, lo que <b>vence en 7 días</b> y cuántos clientes deben.</Item>
                        <Item><b>Antigüedad</b>: cuánto está al día y cuánto lleva 1–30, 31–60, 61–90 o más de 90 días vencido. Toca un tramo para ver sus documentos en la lista.</Item>
                        <Item><b>Quién más debe</b>: los clientes con mayor saldo. Toca uno para filtrar la lista.</Item>
                        <Item>En la lista: el botón de <b>WhatsApp</b> prepara un recordatorio para el cliente y la flecha abre el documento para registrar el abono.</Item>
                    </Lista>
                ),
            },
        ],
    },
    {
        valor: 'telefono', titulo: 'En el teléfono', icono: IconDeviceMobile,
        pasos: [
            {
                titulo: 'Cómo se usa en el teléfono', icono: IconDeviceMobile, color: 'grape',
                contenido: (
                    <Lista>
                        <Item>No hay tablas que se desplacen de lado: cada documento o factura es una <b>tarjeta</b> con lo importante en grande (lo que debe, la comisión en $ y en Bs).</Item>
                        <Item>Toca el <b>nombre de un cliente</b> para desplegar sus documentos.</Item>
                        <Item>Los botones (<b>Abonar</b>, <b>Editar</b>, <b>Abono</b>) abren una hoja desde abajo para escribir. Lo demás está en <b>⋯</b>.</Item>
                        <Item>La búsqueda y los filtros se quedan arriba al bajar. Lo que selecciones para pagar aparece en una <b>barra fija abajo</b> con el total y el botón «Pagadas».</Item>
                        <Item>Este tutorial siempre está en el botón <b>«¿Cómo se usa?»</b> de arriba.</Item>
                    </Lista>
                ),
            },
        ],
    },
];

// Todos los pasos en fila (para «Anterior / Siguiente» de una sección a la otra)
const PASOS = SECCIONES.flatMap((s, si) => s.pasos.map((p, pi) => ({ ...p, seccion: s.valor, si, pi, total: s.pasos.length })));
const primerPaso = (valor) => Math.max(0, PASOS.findIndex((p) => p.seccion === valor));

export default function TutorialCxc({ abierto, seccionInicial = 'libro', onCerrar }) {
    const telefono = useEsTelefono();
    const [i, setI] = useState(0);
    const [noMostrar, setNoMostrar] = useState(false);
    useEffect(() => {
        if (!abierto) return;
        setI(primerPaso(seccionInicial));
        setNoMostrar(tutorialYaVisto());
    }, [abierto, seccionInicial]);

    // se guarda al cerrar (por cualquier vía): marcada = no se abre sola; desmarcada = vuelve a abrirse sola la próxima vez
    const cerrar = () => { guardarLocal(LLAVE_TUTORIAL, noMostrar ? '1' : null); onCerrar(); };
    const paso = PASOS[i];
    const seccion = SECCIONES[paso.si];
    const Icono = paso.icono;
    const ultimo = i === PASOS.length - 1;
    const puntos = useMemo(() => PASOS.map((p, k) => ({ ...p, k })).filter((p) => p.seccion === paso.seccion), [paso.seccion]);
    const teclas = (e) => {
        if (e.key === 'ArrowRight' && !ultimo) setI(i + 1);
        if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };

    return (
        <Modal
            opened={abierto} onClose={cerrar} size="xl" centered fullScreen={Boolean(telefono)}
            title={<Text fw={900} c="navy.9" fz={telefono ? 16 : 18}>¿Cómo se usa Cuentas por cobrar?</Text>}
        >
            <Stack gap="md" onKeyDown={teclas}>
                {/* Secciones: se pasa directo a la que interesa */}
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing={6} role="tablist" aria-label="Secciones del tutorial">
                    {SECCIONES.map((s) => {
                        const activa = s.valor === paso.seccion;
                        const IconoS = s.icono;
                        return (
                            <UnstyledButton
                                key={s.valor} role="tab" aria-selected={activa} onClick={() => setI(primerPaso(s.valor))}
                                px={10} py={8} style={{ borderRadius: 10, border: `1px solid ${activa ? 'var(--mantine-color-navy-9)' : '#d5dbe5'}`, background: activa ? 'var(--mantine-color-navy-9)' : '#fff', color: activa ? '#fff' : '#1a1b1e', minHeight: 44 }}
                            >
                                <Group gap={8} wrap="nowrap"><IconoS size={18} style={{ flexShrink: 0 }} /><Text fz={13} fw={700} c="inherit" lh={1.2}>{s.titulo}</Text></Group>
                            </UnstyledButton>
                        );
                    })}
                </SimpleGrid>

                <Box role="tabpanel" aria-live="polite" p={{ base: 'sm', sm: 'md' }} style={{ border: '1px solid #e1e6ee', borderRadius: 12, background: '#fbfcfe', minHeight: telefono ? undefined : 260 }}>
                    <Group align="flex-start" wrap="nowrap" gap="md">
                        <ThemeIcon size={44} radius="xl" color={paso.color} variant="light" visibleFrom="xs" style={{ flexShrink: 0 }}><Icono size={24} /></ThemeIcon>
                        <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text fz={11} c="#5c6675" fw={700} tt="uppercase">{seccion.titulo} · paso {paso.pi + 1} de {paso.total}</Text>
                            <Text fw={800} fz={17} c="navy.9" mb={8}>{paso.titulo}</Text>
                            {paso.contenido}
                        </Box>
                    </Group>
                </Box>

                <Group gap={6} justify="center" aria-label="Pasos de esta sección">
                    {puntos.map((p) => (
                        <UnstyledButton key={p.k} onClick={() => setI(p.k)} aria-label={`Ir al paso ${p.pi + 1}: ${p.titulo}`} aria-current={p.k === i ? 'step' : undefined} p={4}>
                            <Box style={{ width: p.k === i ? 22 : 9, height: 9, borderRadius: 9, background: p.k === i ? 'var(--mantine-color-navy-9)' : 'var(--mantine-color-gray-4)', transition: 'width .2s' }} />
                        </UnstyledButton>
                    ))}
                </Group>

                <Group justify="space-between" wrap="wrap" gap="sm" className={classes.noImprimir}>
                    <Checkbox size="md" label="No volver a mostrar" checked={noMostrar} onChange={(e) => setNoMostrar(e.currentTarget.checked)} />
                    <Group gap="xs" wrap="nowrap">
                        {i > 0 && <Button variant="default" size="sm" leftSection={<IconArrowLeft size={16} />} onClick={() => setI(i - 1)}>Anterior</Button>}
                        {ultimo
                            ? <Button size="sm" color="teal" onClick={cerrar}>Entendido</Button>
                            : <Button size="sm" color="navy.9" rightSection={<IconArrowRight size={16} />} onClick={() => setI(i + 1)}>Siguiente</Button>}
                    </Group>
                </Group>
                {!ultimo && <Text fz={12} c="#5c6675" ta="center">Puedes cerrarlo cuando quieras y volver a verlo con «¿Cómo se usa?».</Text>}
            </Stack>
        </Modal>
    );
}
