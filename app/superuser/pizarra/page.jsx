"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  Container, Title, Text, Group, Loader,
  Box, Button, Paper, HoverCard, Badge, Stack, Divider, ThemeIcon,
  Card, ScrollArea, Avatar, UnstyledButton, ActionIcon, Tooltip,
  Popover, Table, Modal, Checkbox
} from "@mantine/core";
import {
  IconChevronLeft, IconChevronRight, IconSteeringWheel,
  IconClipboardText, IconCalendarEvent, IconTruck, IconTool,
  IconUsers, IconArrowLeft, IconMapPin, IconClock, IconPrinter
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";

// COMPONENTES PROPIOS
import ManualHoursButton from "./ManualHoursButton";
import { toLocalDate } from "@/app/helpers/fechaCaracas";
import { formatDateLong } from "@/app/helpers/dateUtils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// --- ESTILOS CSS PARA LA ANIMACIÓN Y LA IMPRESIÓN ---
const PulseAndPrintStyles = () => (
  <style global jsx>{`
    @keyframes pulse-yellow {
      0% { box-shadow: 0 0 0 0 rgba(250, 176, 5, 0.7); }
      70% { box-shadow: 0 0 0 6px rgba(250, 176, 5, 0); }
      100% { box-shadow: 0 0 0 0 rgba(250, 176, 5, 0); }
    }
    .pulsing-badge {
      animation: pulse-yellow 2s infinite;
    }
    .fc-event {
        cursor: pointer;
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
    }
    .fc-timegrid-event-harness {
        margin-bottom: 2px; 
    }

    /* ESTILOS ESTRICTOS DE IMPRESIÓN */
    @media screen {
      #seccion-imprimir { display: none !important; }
    }
    @media print {
      /* Destruir fondos globales que ensucian la hoja */
      html, body, #__next, .mantine-AppShell-root, .mantine-AppShell-main {
        background-color: #ffffff !important;
        background-image: none !important;
      }

      /* Ocultar elementos globales del AppShell y navegación */
      header, nav, aside, footer,
      .mantine-AppShell-header, 
      .mantine-AppShell-navbar,
      .no-print { 
        display: none !important; 
      }
      
      /* Quitar padding global del contenedor principal de Mantine */
      .mantine-AppShell-main { 
        padding: 0 !important; 
        margin: 0 !important;
      }

      /* Eliminar restricciones de ancho del Container */
      .mantine-Container-root {
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      /* Posicionar la tabla al ras de la hoja */
      #seccion-imprimir {
        display: block !important;
        position: relative; 
        width: 100%;
        padding: 0;
        margin: 0;
        background-color: white !important;
      }

      @page { size: portrait; margin: 15mm; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .mantine-Table-tr { page-break-inside: avoid; }
      .mantine-Table-th { background-color: #f1f3f5 !important; color: #1e293b !important; font-weight: 800 !important; }
    }
  `}</style>
);

// --- COLORES CORPORATIVOS ---
const COLORS = {
  petrol: '#1e293b',
  yellow: '#f59f00',
  gray: '#f8f9fa',
  accentBlue: '#1c7ed6',
  accentOrange: '#d9480f',
  accentTeal: '#0ca678',
};

// ==========================================
// 1. HELPERS VISUALES Y LÓGICOS
// ==========================================

const agruparRegistros = (registros) => {
  const grupos = {};
  if (!registros) return [];
  registros.forEach((reg) => {
    const obs = (reg.observaciones || "Sin observaciones").trim();
    const key = `${reg.horas}-${obs}`;
    if (!grupos[key]) {
      grupos[key] = { key, horas: reg.horas, observaciones: obs, empleados: [] };
    }
    grupos[key].empleados.push(reg.Empleado);
  });
  return Object.values(grupos);
};

function VehiculoLine({ activo }) {
  if (!activo) return null;
  const instancia = activo.vehiculoInstancia || activo.remolqueInstancia || activo.maquinaInstancia;
  const marca = instancia?.plantilla?.marca || '';
  const modelo = instancia?.plantilla?.modelo || 'Genérico';
  const placa = instancia?.placa || activo.codigoInterno || 'S/P';

  return (
    <Group gap={6} wrap="nowrap" style={{ opacity: 0.9 }}>
      <ThemeIcon variant="transparent" color="white" size={14}>
        {activo.maquinaInstancia ? <IconTool size={12} /> : <IconSteeringWheel size={12} />}
      </ThemeIcon>
      <Text size="10px" c="white" truncate fw={600}>
        {placa} <Text span fw={400} style={{ opacity: 0.7 }}>• {marca} {modelo}</Text>
      </Text>
    </Group>
  );
}

function VehiculoLineMobile({ activo, icon, color = "gray" }) {
  if (!activo) return null;
  const instancia = activo.vehiculoInstancia || activo.remolqueInstancia || activo.maquinaInstancia;
  const marca = instancia?.plantilla?.marca || '';
  const modelo = instancia?.plantilla?.modelo || 'Genérico';
  const placa = instancia?.placa || activo.codigoInterno || 'S/P';

  return (
    <Paper withBorder p={6} radius="sm" bg="gray.0">
      <Group gap="xs" wrap="nowrap">
        <ThemeIcon variant="light" color={color} size="md" radius="md">{icon}</ThemeIcon>
        <Box style={{ lineHeight: 1.1 }}>
          <Text size="sm" fw={700} c="dark.5">{placa}</Text>
          <Text size="xs" c="dimmed">{marca} {modelo}</Text>
        </Box>
      </Group>
    </Paper>
  );
}

const PersonalAvatar = ({ empleado, rol, router, entrada, salida }) => {
  if (!empleado) return null;
  const tieneHorario = entrada && salida;
  return (
    <UnstyledButton onClick={() => router.push(`/superuser/rrhh/empleados/${empleado.id}`)} style={{ width: '100%' }}>
      <Group wrap="nowrap" align="flex-start">
        <Avatar src={empleado?.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${empleado.imagen}` : null} size={38} radius="xl" color="blue">
          {empleado.nombre?.charAt(0)}
        </Avatar>
        <Box>
          <Text size="sm" fw={700} lh={1.1}>{empleado.nombre} {empleado.apellido}</Text>
          <Text size="xs" c="dimmed" fw={500}>{rol}</Text>
          {tieneHorario && (
            <Group gap={4} mt={2}>
              <IconClock size={10} color="var(--mantine-color-blue-6)" />
              <Text size="10px" fw={700} c="blue.7">Base: {entrada.substring(0, 5)} - {salida.substring(0, 5)}</Text>
            </Group>
          )}
        </Box>
      </Group>
    </UnstyledButton>
  )
}

const VehiculoItem = ({ activo }) => {
  const instancia = activo?.vehiculoInstancia || activo?.remolqueInstancia || activo?.maquinaInstancia;
  if (!instancia) return null;
  const marca = instancia.plantilla?.marca || '';
  const modelo = instancia.plantilla?.modelo || '';

  return (
    <Group gap="xs" wrap="nowrap">
      <ThemeIcon size="xs" color="gray" variant="transparent">
        {activo.maquinaInstancia ? <IconTool /> : <IconSteeringWheel />}
      </ThemeIcon>
      <Text size="xs" fw={600}>{instancia.placa || activo.codigoInterno} <Text span c="dimmed" fw={400}>{marca} {modelo}</Text></Text>
    </Group>
  )
}

// CACHÉ GLOBAL
const summaryCache = {};
const fetchStatus = {};

// ==========================================
// 2. COMPONENTE EVENT MINIATURE
// ==========================================
const EventMiniature = ({ event, router }) => {
  const props = event.extendedProps;
  const isODT = event.id.startsWith('odt');
  const isFlete = event.id.startsWith('flete');
  const isManualGroup = event.id.startsWith('group-manual');
  const eventId = event.id;

  const isEnCurso = (isODT || isFlete) && props.estado === 'En Curso';

  let cardBgColor = COLORS.petrol;
  if (isODT && props.maquinaria) {
    cardBgColor = COLORS.accentOrange;
  } else if (isFlete) {
    cardBgColor = COLORS.accentTeal;
  }

  const [resumenAI, setResumenAI] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    if (!isManualGroup) return;
    if (summaryCache[eventId]) { setResumenAI(summaryCache[eventId]); return; }
    if (fetchStatus[eventId] === 'loading') return;

    fetchStatus[eventId] = 'loading';
    setLoadingAI(true);

    const fechaEvento = new Date(event.start);
    fechaEvento.setHours(0, 0, 0, 0);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const diaSemana = hoy.getDay();
    const diasDesdeViernes = (diaSemana + 2) % 7;
    const viernesInicioSemana = new Date(hoy);
    viernesInicioSemana.setDate(hoy.getDate() - diasDesdeViernes);

    const esFechaReciente = fechaEvento >= viernesInicioSemana && fechaEvento <= hoy;

    fetch(`/api/ai/generar-resumen?t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: JSON.stringify({
        observaciones: props.registros.map(r => r.observaciones).filter(o => o?.length > 3),
        fecha: event.start,
        permitirGeneracion: esFechaReciente
      })
    })
      .then(res => { if (res.status === 429) throw new Error("Busy"); return res.json(); })
      .then(data => {
        const textoFinal = data.resumen || "Histórico sin resumen.";
        summaryCache[eventId] = textoFinal;
        fetchStatus[eventId] = 'done';
        setResumenAI(textoFinal);
      })
      .catch(err => {
        console.error(err);
        fetchStatus[eventId] = null;
        if (err.message === "Busy") setResumenAI("IA saturada.");
        else setResumenAI("Ver detalles.");
      })
      .finally(() => {
        setLoadingAI(false)
      });
  }, [eventId, isManualGroup, event.start, props.registros]);


  const HoverContent = () => {
    const subGrupos = isManualGroup ? agruparRegistros(props.registros) : [];
    return (
      <Stack gap="md" p="md" w={{ base: 320, sm: 500 }}>
        <Group justify="space-between" align="start">
          <Box>
            <Badge size="lg" variant="filled" color={isODT ? (props.maquinaria ? 'orange' : 'blue') : isFlete ? 'teal' : 'gray'} radius="sm">
              {isODT ? `ODT #${props.nroODT}` : isFlete ? `FLETE #${props.nroFlete || props.realId}` : 'REGISTRO INTERNO'}
            </Badge>
            {(isODT || isFlete) && <Text fw={800} size="md" mt={4} lh={1.2} c="dark.8">{props.cliente?.nombre || 'Cliente General'}</Text>}
          </Box>
          <ThemeIcon size="lg" variant="light" color="gray">
            {(isODT || isFlete) ? <IconMapPin size={18} /> : <IconClipboardText size={18} />}
          </ThemeIcon>
        </Group>
        <Divider color="gray.2" />

        {(isODT || isFlete) ? (
          <>
            <Text size="sm" c="dimmed" lh={1.4}>{props.descripcionServicio || props.observaciones || props.descripcion}</Text>

            <Box bg="gray.0" p="xs" style={{ borderRadius: 8 }}>
              <Badge variant="dot" color="gray" size="sm">
                Rango Horas: {event.start.toString().substring(16, 21)} - {event.end ? event.end.toString().substring(16, 21) : 'N/A'}
              </Badge>
            </Box>

            <Box>
              <Text size="10px" tt="uppercase" fw={800} c="dimmed" mb={4}>Flota Asignada</Text>
              <Stack gap={6}>
                {props.vehiculoPrincipal && <VehiculoItem activo={props.vehiculoPrincipal} />}
                {props.vehiculo && <VehiculoItem activo={props.vehiculo} />}
                {props.vehiculoRemolque && <VehiculoItem activo={props.vehiculoRemolque} />}
                {props.remolque && <VehiculoItem activo={props.remolque} />}
                {props.maquinaria && <VehiculoItem activo={props.maquinaria} />}
              </Stack>
            </Box>

            <Box>
              <Text size="10px" tt="uppercase" fw={800} c="dimmed" mb={4}>Personal Asignado</Text>
              <Group gap="sm">
                {props.empleadosAsignados?.map((emp, idx) => (
                  <PersonalAvatar key={idx} empleado={emp} rol={emp.rolAsignado || "Operador"} router={router} entrada={emp.horaInicio} salida={emp.horaFin} />
                ))}
              </Group>
            </Box>
          </>
        ) : (
          <ScrollArea.Autosize mah={400}>
            <Stack gap="md">
              {subGrupos.map((grupo, idx) => (
                <Paper key={idx} withBorder p="md" radius="md" bg="white" shadow="xs">
                  <Group align="flex-start" wrap="nowrap" mb="xs">
                    <Avatar.Group spacing="sm" mr={10}>
                      {grupo.empleados.map(emp => (
                        <Tooltip key={emp.id} label={`${emp.nombre} ${emp.apellido}`}>
                          <UnstyledButton onClick={() => router.push(`/superuser/rrhh/empleados/${emp.id}`)}>
                            <Avatar src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} radius="xl" size={40} color="blue">{emp.nombre?.charAt(0)}</Avatar>
                          </UnstyledButton>
                        </Tooltip>
                      ))}
                    </Avatar.Group>
                    <Box style={{ flex: 1 }}>
                      {grupo.empleados.map((e, index) => (
                        <UnstyledButton key={e.id} onClick={() => router.push(`/superuser/rrhh/empleados/${e.id}`)}>
                          <Text size="sm" fw={700} c="dark.8" lh={1.3}> {" " + e.nombre + (index < grupo.empleados.length - 1 ? ", " : "")} </Text>
                        </UnstyledButton>
                      ))}
                      <Badge size="sm" color="dark" variant="light" mt={4}>{grupo.horas} Horas</Badge>
                    </Box>
                  </Group>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{grupo.observaciones}</Text>
                </Paper>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    );
  };

  return (
    <HoverCard width="auto" shadow="xl" withArrow openDelay={200} position="right-start" radius="md">
      <HoverCard.Target>
        <div style={{ width: '100%', height: '100%' }}>
          <Box style={{
            width: '100%', height: '100%', overflow: 'hidden', padding: '8px 10px',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6,
            backgroundColor: cardBgColor,
            border: isEnCurso ? '2px solid #fcc419' : 'none',
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.1) 100%)',
            color: 'white'
          }}>

            <Group gap={8} wrap="nowrap" align="flex-start" justify="space-between">
              <Group gap={6} wrap="nowrap" style={{ flex: 1 }}>
                {isManualGroup ? <IconUsers size={16} color="white" /> : <IconTruck size={16} color="white" />}
                <Box style={{ lineHeight: 1 }}>
                  <Text size="11px" fw={800} c="white" tt="uppercase" style={{ opacity: 0.9 }}>
                    {isODT ? `ODT #${props.nroODT}` : isFlete ? `FLETE #${props.nroFlete || props.realId}` : `TRABAJO EN BASE`}
                  </Text>

                  {isEnCurso ? (
                    <Badge size="xs" variant="filled" color="yellow" c="dark" className="pulsing-badge" style={{ marginTop: 2, fontSize: '9px', height: 16 }}>
                      ● EN CURSO
                    </Badge>
                  ) : (
                    <Text size="13px" fw={900} c="white" lineClamp={2} style={{ lineHeight: 1.1, marginTop: 2 }}>
                      {(isODT || isFlete) ? props.cliente?.nombre : `${props.total} EMPLEADOS`}
                    </Text>
                  )}
                </Box>
              </Group>
            </Group>

            {isEnCurso && (isODT || isFlete) && <Text size="11px" c="white" fw={700} lineClamp={1}>{props.cliente?.nombre}</Text>}

            <Group mt="auto" pt={6} justify="space-between" align="center" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
              <Avatar.Group spacing="md">
                {(isODT || isFlete) && props.empleadosAsignados?.slice(0, 3).map((emp, i) => (
                  <Avatar key={i} src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} size={30} radius="xl">{emp.nombre?.charAt(0)}</Avatar>
                ))}
                {(isODT || isFlete) && props.empleadosAsignados?.length > 3 && (
                  <Avatar size={24} radius="xl" bg="white" c="dark" fs="xs">+{props.empleadosAsignados.length - 3}</Avatar>
                )}

                {isManualGroup && props.registros?.slice(0, 3).map((r, i) => (
                  <Avatar key={i} src={r.Empleado?.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${r.Empleado.imagen}` : null} size={30} radius="xl">{r.Empleado?.nombre?.charAt(0)}</Avatar>
                ))}
                {isManualGroup && props.total > 3 && <Avatar size={24} radius="xl" bg="white" c="dark" fs="xs">+{props.total - 3}</Avatar>}
              </Avatar.Group>
            </Group>

            <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {(isODT || isFlete) ? (
                <>
                  <Text size="11px" c="white" style={{ opacity: 0.9, lineHeight: 1.3, flex: 1, overflow: 'hidden' }}>{props.descripcionServicio || props.observaciones || props.descripcion}</Text>
                  <Box mt="auto" style={{ paddingTop: 4 }}>
                    {props.vehiculoPrincipal && <VehiculoLine activo={props.vehiculoPrincipal} />}
                    {(!props.vehiculoPrincipal && props.vehiculo) && <VehiculoLine activo={props.vehiculo} />}
                  </Box>
                </>
              ) : (
                <>
                  <Divider color="white" my={4} style={{ opacity: 0.5 }} />
                  <Box style={{ flex: 1, overflow: 'hidden' }}>
                    {loadingAI ? (
                      <Group gap={4}><Loader size={10} color="white" /><Text size="10px" c="white">IA Analizando...</Text></Group>
                    ) : (
                      <Text size="14px" c="white" fw={700} style={{ lineHeight: 1.3, whiteSpace: 'pre-wrap', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{resumenAI || "Generando..."}</Text>
                    )}
                  </Box>
                </>
              )}
            </Box>

          </Box>
        </div>
      </HoverCard.Target>
      <HoverCard.Dropdown p={0}><HoverContent /></HoverCard.Dropdown>
    </HoverCard>
  );
};


// ==========================================
// 3. PAGE MAIN COMPONENT
// ==========================================
export default function PizarraPage() {
  const [rawHoras, setRawHoras] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para el Modal de Impresión
  const [printModalOpened, setPrintModalOpened] = useState(false);
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);

  const router = useRouter();
  const calendarRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const resHoras = await fetch("/api/rrhh/horas-trabajadas").then(r => r.ok ? r.json() : []);
        setRawHoras(resHoras);

        const gruposODT = {};
        const gruposFlete = {};
        const gruposManuales = {};

        if (Array.isArray(resHoras)) {
          resHoras.forEach(registro => {
            const emp = registro.Empleado;
            const extrasEmp = emp ? { ...emp, rolAsignado: registro.observaciones, horaInicio: registro.inicio, horaFin: registro.fin } : null;

            const dateKey = registro.fecha.split('T')[0];

            if (registro.origen === 'odt' && registro.ODT) {
              const key = `odt-${registro.odtId}-${dateKey}`;
              if (!gruposODT[key]) gruposODT[key] = { ...registro.ODT, fechaRegistro: dateKey, empleadosAsignados: [] };
              if (extrasEmp) gruposODT[key].empleadosAsignados.push(extrasEmp);
            }
            else if (registro.origen === 'flete' && registro.Flete) {
              const key = `flete-${registro.fleteId}-${dateKey}`;
              if (!gruposFlete[key]) gruposFlete[key] = { ...registro.Flete, fechaRegistro: dateKey, empleadosAsignados: [] };
              if (extrasEmp) gruposFlete[key].empleadosAsignados.push(extrasEmp);
            }
            else {
              if (!gruposManuales[dateKey]) gruposManuales[dateKey] = [];
              gruposManuales[dateKey].push(registro);
            }
          });
        }

        const eventosFinales = [];

        Object.values(gruposODT).forEach(odt => {
          const horaLlegada = odt.empleadosAsignados[0]?.horaInicio || odt.horaLlegada || '08:00:00';
          const horaSalida = odt.empleadosAsignados[0]?.horaFin || odt.horaSalida || '17:00:00';

          eventosFinales.push({
            id: `odt-${odt.id}-${odt.fechaRegistro}`,
            realId: odt.id,
            tipo: 'odt',
            start: `${odt.fechaRegistro}T${horaLlegada}`,
            end: `${odt.fechaRegistro}T${horaSalida}`,
            extendedProps: { ...odt, cliente: odt.Cliente || odt.cliente },
            backgroundColor: odt.maquinaria ? COLORS.accentOrange : COLORS.petrol,
            borderColor: 'transparent',
            textColor: 'white'
          });
        });

        Object.values(gruposFlete).forEach(flete => {
          const horaInicio = flete.empleadosAsignados[0]?.horaInicio || '06:00:00';
          const horaFin = flete.empleadosAsignados[0]?.horaFin || '18:00:00';

          eventosFinales.push({
            id: `flete-${flete.id}-${flete.fechaRegistro}`,
            realId: flete.id,
            tipo: 'flete',
            start: `${flete.fechaRegistro}T${horaInicio}`,
            end: `${flete.fechaRegistro}T${horaFin}`,
            extendedProps: { ...flete, cliente: flete.Cliente || flete.cliente },
            backgroundColor: COLORS.accentTeal,
            borderColor: 'transparent',
            textColor: 'white'
          });
        });

        Object.keys(gruposManuales).forEach(date => {
          const registros = gruposManuales[date];
          eventosFinales.push({
            id: `group-manual-${date}`,
            tipo: 'manual-group',
            title: 'Trabajo en Base',
            start: `${date}T08:00:00`,
            end: `${date}T16:00:00`,
            extendedProps: { registros: registros, total: registros.length },
            backgroundColor: COLORS.petrol,
            borderColor: 'transparent',
            textColor: 'white'
          });
        });

        setEvents(eventosFinales);
      } catch (error) {
        console.error("Error cargando pizarra:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // LÓGICA DE REPORTE PARA IMPRESIÓN (DESDE EL SÁBADO ANTERIOR HASTA HOY)
  const dataImpresion = useMemo(() => {
    if (!rawHoras || rawHoras.length === 0) return { empleados: [], inicio: null, fin: null };

    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);

    // JS getDay(): 0=Domingo, 1=Lunes, 2=Martes, 3=Miercoles, 4=Jueves, 5=Viernes, 6=Sabado
    const diaSemana = hoy.getDay();
    // Para llegar al sabado anterior: si hoy es sabado (6) restamos 0, si es viernes (5) restamos 6, etc.
    const daysToSubtract = (diaSemana + 1) % 7;

    const sabadoAnterior = new Date(hoy);
    sabadoAnterior.setDate(hoy.getDate() - daysToSubtract);
    sabadoAnterior.setHours(0, 0, 0, 0);

    const filtradas = rawHoras.filter(r => {
      // Parseamos seguro añadiendo T12:00:00 para evitar desfasaje por zona horaria de Caracas
      const d = new Date(r.fecha + 'T12:00:00');
      return d >= sabadoAnterior && d <= hoy;
    });

    const agrupado = {};
    filtradas.forEach(r => {
      const empId = r.empleadoId;
      if (!agrupado[empId]) {
        agrupado[empId] = { empleado: r.Empleado, total: 0, registros: [] };
      }
      agrupado[empId].total += Number(r.horas) || 0;
      agrupado[empId].registros.push(r);
    });

    // Ordenar los registros cronológicamente (ascendente) dentro de cada empleado
    Object.values(agrupado).forEach(empData => {
      empData.registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
    });

    return {
      empleados: Object.values(agrupado).sort((a, b) => a.empleado.nombre.localeCompare(b.empleado.nombre)),
      inicio: sabadoAnterior,
      fin: hoy
    };
  }, [rawHoras]);

  // Sincronizar los empleados seleccionados por defecto (todos) cuando se carga la data
  useEffect(() => {
    if (dataImpresion.empleados.length > 0) {
      setSelectedEmpIds(dataImpresion.empleados.map(e => e.empleado.id));
    }
  }, [dataImpresion]);

  // Filtrar los empleados finales a imprimir basado en el array selectedEmpIds
  const empleadosAImprimir = useMemo(() => {
    return dataImpresion.empleados.filter(e => selectedEmpIds.includes(e.empleado.id));
  }, [dataImpresion, selectedEmpIds]);

  const renderEventContent = (info) => <EventMiniature key={info.event.id} event={info.event} router={router} />;

  if (loading) return <Stack align="center" justify="center" h="100vh"><Loader color={COLORS.petrol} /><Text size="sm" c="dimmed">Cargando...</Text></Stack>;

  return (
    <Container size="xl" p="md" style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <PulseAndPrintStyles />

      {/* ========================================== */}
      {/* MODAL DE SELECCIÓN DE IMPRESIÓN            */}
      {/* ========================================== */}
      <Modal opened={printModalOpened} onClose={() => setPrintModalOpened(false)} title={<Text fw={800} c={COLORS.petrol}>Configurar Reporte</Text>} centered>
        <Stack>
          <Group justify="space-between">
            <Text size="sm" fw={600} c="dimmed">Seleccione el personal a incluir:</Text>
            <Button variant="subtle" size="xs" onClick={() => setSelectedEmpIds(dataImpresion.empleados.map(e => e.empleado.id))}>
              Marcar Todos
            </Button>
          </Group>
          <ScrollArea h={300} type="always" offsetScrollbars>
            <Stack gap="sm">
              {dataImpresion.empleados.map(emp => (
                <Checkbox
                  key={emp.empleado.id}
                  label={
                    <Group gap="sm">
                      <Avatar src={emp.empleado.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.empleado.imagen}` : null} size="sm" radius="xl" />
                      <Text size="sm" fw={600}>{emp.empleado.nombre} {emp.empleado.apellido} <Text span size="xs" c="dimmed">({emp.total} hrs)</Text></Text>
                    </Group>
                  }
                  checked={selectedEmpIds.includes(emp.empleado.id)}
                  onChange={(event) => {
                    if (event.currentTarget.checked) {
                      setSelectedEmpIds(prev => [...prev, emp.empleado.id]);
                    } else {
                      setSelectedEmpIds(prev => prev.filter(id => id !== emp.empleado.id));
                    }
                  }}
                  color={COLORS.petrol}
                />
              ))}
            </Stack>
          </ScrollArea>
          <Button
            fullWidth
            color={COLORS.petrol}
            leftSection={<IconPrinter size={18} />}
            onClick={() => {
              setPrintModalOpened(false);
              setTimeout(() => window.print(), 150); // Pequeño retraso para que la animación del modal cierre antes de capturar la pantalla
            }}
            disabled={selectedEmpIds.length === 0}
          >
            Generar e Imprimir
          </Button>
        </Stack>
      </Modal>

      {/* ========================================== */}
      {/* VISTA NORMAL PANTALLA (OCULTO EN IMPRESIÓN) */}
      {/* ========================================== */}
      <Box className="no-print" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* HEADER */}
        <Paper shadow="xs" p="sm" radius="md" mb="md" withBorder bg="white">
          <Group justify="space-between">
            <Group>
              <ActionIcon variant="light" color="gray" onClick={() => router.back()} size="lg" radius="md"><IconArrowLeft size={20} /></ActionIcon>
              <Box visibleFrom="xs">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed" lts={1}>Logística</Text>
                <Title order={3} c={COLORS.petrol}>Pizarra Semanal</Title>
              </Box>
              <Group gap={4} ml="md" visibleFrom="sm">
                <Tooltip label="Anterior"><ActionIcon variant="default" onClick={() => calendarRef.current?.getApi().prev()} radius="md"><IconChevronLeft size={18} /></ActionIcon></Tooltip>
                <Button variant="default" onClick={() => calendarRef.current?.getApi().today()} radius="md" fw={600}>Hoy</Button>
                <Tooltip label="Siguiente"><ActionIcon variant="default" onClick={() => calendarRef.current?.getApi().next()} radius="md"><IconChevronRight size={18} /></ActionIcon></Tooltip>
              </Group>
            </Group>
            <Group gap="xs">
              {/* BOTÓN ABRE MODAL IMPRESIÓN */}
              <Button variant="outline" color={COLORS.petrol} leftSection={<IconPrinter size={18} />} radius="md" onClick={() => setPrintModalOpened(true)}>
                Imprimir
              </Button>
              <ManualHoursButton />
              <Button onClick={() => router.push('/superuser/odt/nuevo')} color={COLORS.petrol} leftSection={<IconClipboardText size={18} />} radius="md">Nueva ODT</Button>
            </Group>
          </Group>
          <Group hiddenFrom="sm" mt="sm" grow>
            <Button variant="default" onClick={() => calendarRef.current?.getApi().prev()}><IconChevronLeft /></Button>
            <Button variant="default" onClick={() => calendarRef.current?.getApi().today()}>Hoy</Button>
            <Button variant="default" onClick={() => calendarRef.current?.getApi().next()}><IconChevronRight /></Button>
          </Group>
        </Paper>

        {/* CALENDAR */}
        <Box visibleFrom="sm" style={{ flex: 1, minHeight: 0 }}>
          <Paper shadow="sm" p={0} radius="md" withBorder style={{ height: '100%', overflow: 'hidden' }}>
            <FullCalendar
              ref={calendarRef}
              plugins={[timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={false}
              locale={esLocale}
              firstDay={5}
              events={events}
              eventContent={renderEventContent}
              eventClick={(info) => {
                if (info.event.id.startsWith('odt')) router.push(`/superuser/odt/${info.event.extendedProps.realId}`);
                else if (info.event.id.startsWith('flete')) router.push(`/superuser/fletes/${info.event.extendedProps.realId}`);
              }}
              slotEventOverlap={false}
              eventMaxStack={3}
              height="100%"
              expandRows={true}
              allDaySlot={false}
              slotMinTime="05:00:00"
              slotMaxTime="23:00:00"
              nowIndicator={true}
            />
          </Paper>
        </Box>

        {/* MOBILE */}
        <Box hiddenFrom="sm">
          <MobileAgendaView events={events} router={router} />
        </Box>
      </Box>

      {/* ========================================== */}
      {/* SECCIÓN OCULTA PARA IMPRESIÓN              */}
      {/* ========================================== */}
      <Box id="seccion-imprimir">
        <Group justify="space-between" align="flex-start" mb="xl" style={{ borderBottom: '2px solid #1e293b', paddingBottom: 10 }}>
          <Group>
            {/* Logo de la empresa */}
            <img src="/tenants/dadica/logo.png" alt="Dadica Logo" style={{ height: 60, objectFit: 'contain' }} />
            <Box>
              <Text fw={900} size="xl" c="dark.8">TRANSPORTE DADICA C.A.</Text>
              <Text size="sm" c="dimmed">Ciudad Ojeda, Zulia, Venezuela</Text>
              <Text size="sm" c="dimmed">Control de Horas del Personal Operativo</Text>
            </Box>
          </Group>
          <Box ta="right">
            <Text fw={900} size="lg" c={COLORS.petrol}>REPORTE SEMANAL DE HORAS</Text>
            <Text size="sm" fw={600} c="dimmed">
              Periodo: {dataImpresion.inicio ? formatDateLong(dataImpresion.inicio.toISOString()) : ''}
              {' '} al {' '}
              {dataImpresion.fin ? formatDateLong(dataImpresion.fin.toISOString()) : ''}
            </Text>
          </Box>
        </Group>

        <Table withTableBorder withColumnBorders size="xs" verticalSpacing={2}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w="25%">Empleado</Table.Th>
              <Table.Th w="15%">Fecha</Table.Th>
              <Table.Th w="35%">Actividad (Origen)</Table.Th>
              <Table.Th w="15%" ta="center">Horario</Table.Th>
              <Table.Th w="10%" ta="center">Horas</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {empleadosAImprimir.map(emp => (
              <React.Fragment key={emp.empleado.id}>
                {emp.registros.map((reg, idx) => (
                  <Table.Tr key={reg.id} style={idx === 0 ? { borderTop: '3px solid #1e293b' } : {}}>
                    {idx === 0 && (
                      <Table.Td rowSpan={emp.registros.length} style={{ verticalAlign: 'middle', backgroundColor: '#fcfcfc', padding: '12px 8px' }}>
                        <Stack gap="xs" align="center">
                          <Avatar
                            src={emp.empleado.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.empleado.imagen}` : null}
                            size="lg"
                            radius="xl"
                          />

                          <Box ta="center">
                            <Text size="sm" fw={900} lh={1.1}>{emp.empleado.nombre} {emp.empleado.apellido}</Text>
                            <Text size="10px" c="dimmed" mt={2}>C.I: {emp.empleado.cedula}</Text>
                          </Box>

                          <Box
                            ta="center"
                            mt={4}
                            style={{
                              backgroundColor: '#fff5f5',
                              padding: '6px 16px',
                              borderRadius: '8px',
                              border: '1px solid #ffc9c9'
                            }}
                          >
                            <Text size="9px" fw={800} c="red.9" tt="uppercase" mb={2}>Total Semana</Text>
                            <Text size="h3" fw={900} c="red.7" lh={1}>{emp.total} Hrs</Text>
                          </Box>
                        </Stack>
                      </Table.Td>
                    )}
                    <Table.Td py={4} ta="center">
                      <Text size="10px" fw={800} c="dimmed" tt="uppercase">
                        {format(new Date(reg.fecha + 'T12:00:00'), 'EEE', { locale: es })}
                      </Text>
                      <Text size="xs" fw={600}>{reg.fecha}</Text>
                    </Table.Td>
                    <Table.Td py={4}>
                      <Text size="xs" fw={800} c={reg.origen === 'odt' ? 'blue.7' : reg.origen === 'flete' ? 'teal.7' : 'dark.7'}>
                        {reg.origen === 'odt' ? `ODT #${reg.ODT?.nroODT || reg.odtId}` : reg.origen === 'flete' ? `FLETE #${reg.Flete?.nroFlete || reg.fleteId}` : 'TRABAJO EN BASE'}
                      </Text>
                      <Text size="11px" c="dimmed" lineClamp={2} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.2 }}>
                        {reg.observaciones || (reg.origen === 'odt' ? reg.ODT?.descripcionServicio : reg.Flete?.descripcion)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="center" py={4}>
                      <Text size="xs" ff="monospace" fw={600}>{reg.inicio?.substring(0, 5) || 'N/A'} - {reg.fin?.substring(0, 5) || 'N/A'}</Text>
                    </Table.Td>
                    <Table.Td ta="center" py={4}>
                      <Text size="sm" fw={900}>{reg.horas}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </React.Fragment>
            ))}
            {empleadosAImprimir.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5} ta="center" py="xl">
                  <Text fw={600} c="dimmed">No hay empleados seleccionados.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Box>
    </Container>
  );
}

// ==========================================
// 4. MOBILE VIEW
// ==========================================
function MobileAgendaView({ events, router }) {
  const grouped = useMemo(() => {
    const groups = {};
    const sorted = [...events].sort((a, b) => new Date(b.start) - new Date(a.start));
    sorted.forEach((ev) => {
      const dateKey = ev.start.split("T")[0];
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(ev);
    });
    return groups;
  }, [events]);
  const dates = Object.keys(grouped);

  if (dates.length === 0) return <Paper p="xl" withBorder radius="md" ta="center" bg="gray.0" mt="xl"><Title order={4} c="dimmed">Sin operaciones</Title></Paper>;

  return (
    <Stack gap="lg" pb={80}>
      {dates.map((dateKey) => (
        <Box key={dateKey}>
          <Paper radius={0} p="sm" bg={COLORS.petrol} c="white" shadow="md" style={{ position: "sticky", top: 0, zIndex: 10 }}>
            <Group justify="space-between">
              <Group gap="xs">
                <IconCalendarEvent size={20} className="text-yellow-400" />
                <Text fw={700} tt="capitalize" size="lg">{formatDateLong(dateKey)}</Text>
              </Group>
              <Badge color="yellow" c="dark" variant="filled">{grouped[dateKey].length}</Badge>
            </Group>
          </Paper>
          <Stack gap="md" p="md" bg="gray.0">
            {grouped[dateKey].map((ev) => {
              const props = ev.extendedProps;
              const isGroup = ev.tipo === "manual-group";
              const isODT = ev.tipo === "odt";
              const isEnCurso = !isGroup && props.estado === 'En Curso';

              if (isGroup) {
                const subGrupos = agruparRegistros(props.registros);
                return (
                  <Card key={ev.id} shadow="sm" radius="md" withBorder padding="lg" style={{ borderLeft: `5px solid ${COLORS.accentTeal}` }}>
                    <Group justify="space-between" mb="md">
                      <Group gap="xs">
                        <ThemeIcon color="teal" size="md" radius="md" variant="light"><IconClipboardText size={18} /></ThemeIcon>
                        <Text fw={800} size="md" c="teal.9">Trabajo en Base</Text>
                      </Group>
                      <Badge color="teal" variant="light" size="lg">{props.total} Pers.</Badge>
                    </Group>
                    <Stack gap="md">
                      {subGrupos.map((grupo, idx) => <GroupedEmployeeRow key={idx} grupo={grupo} router={router} />)}
                    </Stack>
                  </Card>
                )
              }
              return (
                <Card key={ev.id} shadow="sm" radius="md" withBorder padding="lg"
                  onClick={() => isODT ? router.push(`/superuser/odt/${props.realId}`) : router.push(`/superuser/fletes/${props.realId}`)}
                  style={{ cursor: "pointer", borderLeft: `5px solid ${isODT ? (props.maquinaria ? COLORS.accentOrange : COLORS.petrol) : COLORS.accentTeal}` }}>
                  <Group justify="space-between" mb="xs" align="start">
                    <Box style={{ flex: 1 }}>
                      <Group gap="xs" mb={4}>
                        <Badge color={isODT ? (props.maquinaria ? "orange" : "blue") : "teal"} variant="filled" size="sm">
                          {isODT ? `ODT #${props.nroODT}` : `FLETE #${props.nroFlete || props.realId}`}
                        </Badge>
                        {isEnCurso && <Badge color="yellow" variant="outline" size="sm" className="pulsing-badge">EN CURSO</Badge>}
                        <Group gap={4}>
                          <IconClock size={14} color="gray" />
                          <Text size="xs" c="dimmed" fw={600}>{ev.start.toString().substring(16, 21)} - {ev.end ? ev.end.toString().substring(16, 21) : 'N/A'}</Text>
                        </Group>
                      </Group>
                      <Title order={5} lineClamp={2} c="dark.8">{props.cliente?.nombre}</Title>
                      <Text size="sm" c="dimmed" lineClamp={2} mt={2}>{props.descripcionServicio || props.observaciones || props.descripcion}</Text>
                    </Box>
                  </Group>
                  <Divider my="sm" />
                  <Stack gap="xs">
                    {props.vehiculoPrincipal && <VehiculoLineMobile activo={props.vehiculoPrincipal} icon={<IconSteeringWheel size={16} />} />}
                    {props.vehiculo && <VehiculoLineMobile activo={props.vehiculo} icon={<IconSteeringWheel size={16} />} />}
                    {props.vehiculoRemolque && <VehiculoLineMobile activo={props.vehiculoRemolque} icon={<IconTruck size={16} />} color="teal" />}
                    {props.remolque && <VehiculoLineMobile activo={props.remolque} icon={<IconTruck size={16} />} color="teal" />}
                    {props.maquinaria && <VehiculoLineMobile activo={props.maquinaria} icon={<IconTool size={16} />} color="orange" />}

                    <Group grow>
                      {props.empleadosAsignados?.slice(0, 2).map((emp, idx) => (
                        <Group gap={8} key={idx}>
                          <Avatar src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} size="sm" radius="xl" />
                          <Box><Text size="xs" fw={700}>{emp.nombre}</Text></Box>
                        </Group>
                      ))}
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

// 5. HELPER ROW MOBILE
const GroupedEmployeeRow = ({ grupo, router }) => {
  const [opened, setOpened] = useState(false);
  const isSingle = grupo.empleados.length === 1;
  const CardContent = (
    <Paper withBorder p="sm" radius="md" bg="white" style={{ position: 'relative' }}>
      {!isSingle && <Box style={{ position: 'absolute', top: 8, right: 8, opacity: 0.4 }}><IconChevronRight size={14} style={{ transform: opened ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} /></Box>}
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={1} mb="xs" style={{ borderBottom: '1px dashed #eee', paddingBottom: 4 }}>{grupo.observaciones}</Text>
      <Group align="flex-start" wrap="nowrap">
        <Avatar.Group spacing="sm">
          {grupo.empleados.slice(0, 4).map(emp => (
            <Avatar key={emp.id} src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} size="md" radius="xl" color="blue" style={{ border: '2px solid white' }}>{emp.nombre?.charAt(0)}</Avatar>
          ))}
          {grupo.empleados.length > 4 && <Avatar size="md" radius="xl" color="gray" variant="light">+{grupo.empleados.length - 4}</Avatar>}
        </Avatar.Group>
        <Box style={{ flex: 1 }}>
          <Text size="sm" fw={600} c="dark.8" lh={1.3} lineClamp={2}>{grupo.empleados.map(e => `${e.nombre}`).join(', ')}</Text>
          <Badge size="sm" color="dark" variant="light" mt={4}>{grupo.horas} Horas</Badge>
        </Box>
      </Group>
    </Paper>
  );

  if (isSingle) return <UnstyledButton onClick={() => router.push(`/superuser/rrhh/empleados/${grupo.empleados[0].id}`)} style={{ width: '100%', display: 'block' }}>{CardContent}</UnstyledButton>;
  return (
    <Popover opened={opened} onChange={setOpened} width={320} position="bottom" withArrow shadow="xl">
      <Popover.Target><UnstyledButton onClick={() => setOpened((o) => !o)} style={{ width: '100%', display: 'block' }}>{CardContent}</UnstyledButton></Popover.Target>
      <Popover.Dropdown p={0} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${COLORS.petrol}` }}>
        <Box bg={COLORS.petrol} p="xs"><Text c="white" fw={700} size="sm" ta="center">Personal Asignado ({grupo.empleados.length})</Text></Box>
        <ScrollArea.Autosize mah={300} type="always">
          <Stack gap={0}>
            {grupo.empleados.map((emp) => (
              <UnstyledButton key={emp.id} onClick={() => router.push(`/superuser/rrhh/empleados/${emp.id}`)} style={{ padding: '10px 14px', borderBottom: '1px solid #f1f3f5' }}>
                <Group><Avatar src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} size={32} radius="xl" color="blue">{emp.nombre?.charAt(0)}</Avatar><Text size="sm" fw={600}>{emp.nombre} {emp.apellido}</Text></Group>
              </UnstyledButton>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}