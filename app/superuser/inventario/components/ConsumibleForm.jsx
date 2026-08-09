'use client';

import { useState, useEffect } from 'react';
import {
    Stack, Select, TextInput, NumberInput,
    Button, Group, Text, Divider, Alert, LoadingOverlay,
    SimpleGrid,
    Paper,
    Checkbox,
    Table,
    ActionIcon,
    Title,
    Switch // 🔥 AÑADIDO PARA EL FLAG UNIVERSAL
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconDeviceFloppy, IconInfoCircle, IconLink, IconTrash, IconPlus } from '@tabler/icons-react';

import SerializadosInputs from './SerializadosInputs';
import { AsyncCatalogComboBox } from '@/app/components/CatalogCombobox';
import ImageDropzone from '../../flota/activos/components/ImageDropzone';
import ModalEquivalencias from '../consumibles/nuevo/ModalEquivalencias';

// --- FUNCIÓN HELPER: Genera el nombre en vivo según los datos y los vehículos ---
const generarNombreDinamico = (values, tipoActual) => {
    let nombreGen = '';
    
    const safeJoin = (arr) => arr.filter(Boolean).join(' ');

    if (tipoActual === 'Filtro') {
        nombreGen = safeJoin([values.categoria, values.marca, values.codigo]);
    } else if (tipoActual === 'Aceite') {
        nombreGen = safeJoin(['Aceite', values.aplicacion, values.marca, values.viscosidad, values.tipoAceite]);
    } else if (tipoActual === 'Bateria') {
        const gr = values.codigo ? `Gr.${values.codigo}` : '';
        const cca = values.amperaje ? `${values.amperaje}CCA` : '';
        nombreGen = safeJoin(['Batería', values.marca, gr, cca]);
    } else if (tipoActual === 'Neumatico') {
        nombreGen = safeJoin(['Neumático', values.marca, values.modelo, values.medida]);
    } else if (tipoActual === 'Correa') {
        nombreGen = safeJoin(['Correa', values.marca, values.codigo]);
    } else if (tipoActual === 'Manguera') {
        const mangueraBase = safeJoin([values.diametro ? `${values.diametro}"` : '', values.longitud ? `x ${values.longitud}cm` : '']);
        const conn = values.conectores ? `(${values.conectores})` : '';
        nombreGen = safeJoin(['Manguera', mangueraBase, conn]);
    } else if (tipoActual === 'Combustible') {
        const categoriaLabel = values.categoria ? values.categoria.charAt(0).toUpperCase() + values.categoria.slice(1) : 'Combustible';
        nombreGen = values.nombre || `Tanque de ${categoriaLabel}`;
    } else if (tipoActual === 'Sensor') {
        nombreGen = values.nombre || safeJoin(['Sensor', values.marca, values.codigo]);
    } else if (tipoActual === 'Herramienta') {
        nombreGen = values.nombre || safeJoin(['Herramienta', values.marca, values.medidaOCapacidad]);
    } else if (tipoActual === 'Repuesto General') {
        nombreGen = safeJoin([values.nombre, values.marca, values.codigo]);
    }

    let base = nombreGen || values.nombre || 'Nuevo Consumible';
    base = base.replace(/ para .*$/i, '').trim();
    base = base.replace(/\s+/g, ' ');

    // 🔥 SI ES UNIVERSAL, CORTAMOS LA LÓGICA DE VEHÍCULOS AQUÍ 🔥
    if (values.esUniversal) {
        return `${base} (Uso Universal)`.trim();
    }

    const vehiculosUnicos = [...new Set((values.recomendaciones || []).map(r => r.vehiculoNombre))].filter(Boolean);
    let sufijoVehiculos = "";
    
    if (vehiculosUnicos.length === 1) {
        sufijoVehiculos = ` para ${vehiculosUnicos[0]}`;
    } else if (vehiculosUnicos.length > 1) {
        const arr = [...vehiculosUnicos];
        const ultimoVehiculo = arr.pop();
        sufijoVehiculos = ` para ${arr.join(', ')} y ${ultimoVehiculo}`;
    }

    return `${base}${sufijoVehiculos}`.trim();
};

export default function ConsumibleForm({ onSuccess, onCancel, initialValues = null, isEdit = false, onSubmit = null }) {
    const [loading, setLoading] = useState(false);

    // Control de UI
    const [tipoEspecifico, setTipoEspecifico] = useState('Filtro'); 
    const [esSerializado, setEsSerializado] = useState(false);
    const [showEquivalencias, setShowEquivalencias] = useState(false);
    const [equivalenciaSeleccionada, setEquivalenciaSeleccionada] = useState(null);

    // Estados para asignaciones de vehículos
    const [listaVehiculos, setListaVehiculos] = useState([]);
    const [listaSubsistemas, setListaSubsistemas] = useState([]);
    const [selectedVehiculo, setSelectedVehiculo] = useState('');
    const [selectedSubsistema, setSelectedSubsistema] = useState('');
    const [cantidadAsignacion, setCantidadAsignacion] = useState(1);

    const form = useForm({
        initialValues: {
            id: null,
            nombre: '',
            marca: '',
            modelo: '',
            stockMinimo: 5,
            stockAlmacen: 0,
            categoria: '',
            precioPromedio: 0.0,

            clasificacion: 'Serializado', 
            unidadMedida: 'unidades', 
            itemsSerializados: [],    

            codigo: '',
            codigoOriginal: '', // CAMPO PARA REPUESTO GENERAL OEM
            marcaOEM: '',       // NUEVO CAMPO GLOBAL OEM
            codigoOEM: '',      // NUEVO CAMPO GLOBAL OEM
            tipo: '',

            posicion: 'Primario',
            imagen: '',
            equivalencias: [],
            
            viscosidad: '', 
            aplicacion: '',
            tipoAceite: '',
            
            amperaje: 800,
            voltaje: 12,
            capacidad: 60,
            
            medida: '',
            esTubeless: false,
            esRecauchable: false,
            
            diametro: '',
            longitud: '', 
            conectores: '',

            tipoTanque: '',
            tanqueLargo: '',
            tanqueAncho: '',
            tanqueAlto: '', 
            tanqueRadio: '',
            capacidadTotalLitros: '',

            tipoAlimentacion: 'Manual',
            medidaOCapacidad: '',
            requiereCalibracion: false,
            esDePrecision: false,
            mesesGarantia: 0,
            ubicacionBase: 'Almacén Principal',
            nombreEspecifico: '',
            
            esUniversal: false, // 🔥 NUEVO ESTADO INICIAL
            recomendaciones: []
        },
        validate: {
            itemsSerializados: (val, values) => {
                if (values.clasificacion === 'Serializado' && val.some(i => !i.serial)) {
                    return 'Todos los seriales son obligatorios';
                }
                return null;
            }
        }
    });

    const tituloEnVivo = generarNombreDinamico(form.values, tipoEspecifico);

    // --- Cargar lista de vehículos ---
    useEffect(() => {
        fetch('/api/gestionMantenimiento/vehiculo')
            .then(res => res.json())
            .then(res => {
                if(res.success && Array.isArray(res.data)) {
                    setListaVehiculos(res.data.map(v => ({ value: v.id.toString(), label: `${v.marca} ${v.modelo}` })));
                }
            })
            .catch(err => console.log('Error cargando vehículos', err));
    }, []);

    // --- Cargar subsistemas dependientes ---
    useEffect(() => {
        if (!selectedVehiculo) {
            setListaSubsistemas([]);
            setSelectedSubsistema('');
            return;
        }
        fetch(`/api/gestionMantenimiento/subsistemas?vehiculoId=${selectedVehiculo}`)
            .then(res => res.json())
            .then(res => {
                if(res.success && Array.isArray(res.data)) {
                    setListaSubsistemas(res.data.map(s => ({ value: s.id.toString(), label: s.nombre })));
                }
            })
            .catch(err => console.log('Error cargando subsistemas', err));
    }, [selectedVehiculo]);

    // --- EFECTO PARA CARGAR DATOS EN EDICIÓN ---
    useEffect(() => {
        if (initialValues) {
            const mappedValues = { ...initialValues };
            form.setValues(mappedValues);
            
            setTipoEspecifico(initialValues.tipoSpecifico || 'Otro');
            setEsSerializado(initialValues.clasificacion === 'Serializado');
        }
    }, [initialValues]);

    useEffect(() => {
        if (initialValues && initialValues.tipoSpecifico === tipoEspecifico) return;

        if (['Bateria', 'Neumatico'].includes(tipoEspecifico)) {
            setEsSerializado(true);
            form.setFieldValue('clasificacion', 'Serializado');
            if (!isEdit) form.setFieldValue('stockAlmacen', 1);
        }
        else if (tipoEspecifico === 'Herramienta') {}
        else {
            setEsSerializado(false);
            form.setFieldValue('clasificacion', 'Fungible');
        }
    }, [tipoEspecifico]);

    useEffect(() => {
        if (form.values.clasificacion === 'Serializado') {
            form.setFieldValue('unidadMedida', 'unidades');
        }
    }, [form.values.clasificacion]);

    useEffect(() => {
        if (isEdit && initialValues && form.values.categoria === initialValues.categoria) return;

        if (tipoEspecifico === 'Filtro') {
            form.setFieldValue('categoria', form.values.tipo ? `filtro de ${form.values.tipo.toLowerCase()}` : '');
            if (!isEdit) form.setFieldValue('unidadMedida', 'unidades');
        } else if (tipoEspecifico === 'Combustible') {
            if (!isEdit && !form.values.categoria) form.setFieldValue('categoria', 'gasoil');
            if (!isEdit) form.setFieldValue('unidadMedida', 'litros');
        } else {
            const categoriaMap = {
                'Aceite': 'aceite',
                'Bateria': 'bateria',
                'Neumatico': 'neumatico',
                'Correa': 'correa',
                'Manguera': 'manguera',
                'Sensor': 'sensor',
                'Repuesto General': 'repuesto general'
            };
            if (tipoEspecifico === "Aceite" && !isEdit) {
                form.setFieldValue('unidadMedida', 'litros');
            }
            if ((tipoEspecifico === "Correa" || tipoEspecifico === "Sensor" || tipoEspecifico === "Manguera" || tipoEspecifico === "Repuesto General") && !isEdit) {
                form.setFieldValue('unidadMedida', 'unidades');
            }
            if (tipoEspecifico === "Bateria" && !isEdit) {
                form.setFieldValue('unidadMedida', 'unidades');
            }

            if (categoriaMap[tipoEspecifico]) {
                form.setFieldValue('categoria', categoriaMap[tipoEspecifico]);
            }
        }
    }, [tipoEspecifico, form.values.tipo]);

    useEffect(() => {
        if (tipoEspecifico !== 'Combustible' || !form.values.tipoTanque) return;

        const { tipoTanque, tanqueLargo, tanqueAncho, tanqueAlto, tanqueRadio } = form.values;
        let capacidad = 0;

        if (tipoTanque === 'cuadrado' && tanqueLargo && tanqueAncho && tanqueAlto) {
            capacidad = (tanqueLargo * tanqueAncho * tanqueAlto) / 1000;
        } else if ((tipoTanque === 'cilindrico_acostado' || tipoTanque === 'cilindrico_parado') && tanqueRadio && tanqueLargo) {
            capacidad = (Math.PI * Math.pow(tanqueRadio, 2) * tanqueLargo) / 1000;
        }

        if (capacidad > 0 && form.values.capacidadTotalLitros !== capacidad.toFixed(2)) {
            form.setFieldValue('capacidadTotalLitros', parseFloat(capacidad.toFixed(2)));
        }
    }, [
        form.values.tipoTanque,
        form.values.tanqueLargo,
        form.values.tanqueAncho,
        form.values.tanqueAlto,
        form.values.tanqueRadio
    ]);

    const handleConfirmEquivalencia = (selectedFilters) => {
        const filtro = selectedFilters[0];

        if (filtro) {
            setEquivalenciaSeleccionada({
                id: filtro.grupoEquivalenciaId || filtro.id,
                nombre: `${filtro.marca} ${filtro.codigo}`,
                esNuevoGrupo: !filtro.grupoEquivalenciaId,
                sugerenciaNombreGrupo: `Grupo para ${filtro.marca} ${filtro.codigo}`
            });
            setShowEquivalencias(false);
        }
    };

    const handleAddRecomendacion = () => {
        if (!selectedVehiculo || !selectedSubsistema || !cantidadAsignacion) {
            notifications.show({ title: 'Atención', message: 'Completa vehículo, subsistema y cantidad', color: 'yellow' });
            return;
        }

        const vehiculoObj = listaVehiculos.find(v => v.value === selectedVehiculo);
        const subsistemaObj = listaSubsistemas.find(s => s.value === selectedSubsistema);

        const exists = form.values.recomendaciones.find(r => r.subsistemaId === parseInt(selectedSubsistema));
        if (exists) {
            notifications.show({ title: 'Aviso', message: 'Este consumible ya está asignado a ese subsistema.', color: 'blue' });
            return;
        }

        const nuevaRecomendacion = {
            id: null,
            subsistemaId: parseInt(selectedSubsistema),
            subsistemaNombre: subsistemaObj?.label,
            vehiculoId: parseInt(selectedVehiculo),
            vehiculoNombre: vehiculoObj?.label,
            cantidad: cantidadAsignacion
        };

        form.setFieldValue('recomendaciones', [...form.values.recomendaciones, nuevaRecomendacion]);
        
        setSelectedSubsistema('');
        setCantidadAsignacion(1);
    };

    const handleRemoveRecomendacion = (indexToRemove) => {
        const nuevas = form.values.recomendaciones.filter((_, idx) => idx !== indexToRemove);
        form.setFieldValue('recomendaciones', nuevas);
    };

    const handleSubmit = async (values) => {
        setLoading(true);

        try {
            let datosTecnicos = {};

            const baseEquivalencia = {
                marcaOEM: values.marcaOEM,
                codigoOEM: values.codigoOEM,
                equivalenciaSeleccionada: equivalenciaSeleccionada || null
            };

            if (tipoEspecifico === 'Filtro') {
                datosTecnicos = {
                    ...baseEquivalencia,
                    marca: values.marca,
                    tipo: values.tipo?.toLowerCase(),
                    codigo: values.codigo,
                    posicion: values.posicion?.toLowerCase(),
                    imagen: values.imagen,
                };
            } else if (tipoEspecifico === 'Aceite') {
                datosTecnicos = {
                    marca: values.marca,
                    modelo: values.modelo,
                    tipoBase: values.tipoAceite,
                    viscosidad: values.viscosidad,
                    aplicacion: values.aplicacion?.toLowerCase(),
                };
            } else if (tipoEspecifico === 'Bateria') {
                datosTecnicos = {
                    marca: values.marca,
                    codigo: values.codigo,
                    amperaje: values.amperaje,
                    voltaje: values.voltaje,
                    capacidad: values.capacidad
                };
            } else if (tipoEspecifico === 'Neumatico') {
                datosTecnicos = {
                    marca: values.marca,
                    modelo: values.modelo,
                    medida: values.medida,
                    esTubeless: values.esTubeless,
                    esRecauchable: values.esRecauchable
                };
            } else if (tipoEspecifico === 'Correa') {
                datosTecnicos = {
                    ...baseEquivalencia,
                    marca: values.marca,
                    codigo: values.codigo,
                };
            } else if (tipoEspecifico === 'Manguera') {
                datosTecnicos = {
                    diametro: values.diametro,
                    longitud: values.longitud,
                    conectores: values.conectores
                };
            } else if (tipoEspecifico === 'Combustible') {
                datosTecnicos = {
                    tipoCombustible: values.categoria, 
                    tipoTanque: values.tipoTanque,
                    dimensiones: {
                        largo: values.tanqueLargo || null,
                        ancho: values.tanqueAncho || null,
                        alto: values.tanqueAlto || null,
                        radio: values.tanqueRadio || null
                    },
                    capacidadTotalLitros: values.capacidadTotalLitros || 0
                };
            } else if (tipoEspecifico === 'Sensor') { 
                datosTecnicos = {
                    ...baseEquivalencia,
                    marca: values.marca,
                    codigo: values.codigo,
                    nombreEspecifico: values.nombre
                };
            } else if (tipoEspecifico === 'Herramienta') {
                datosTecnicos = {
                    marca: values.marca,
                    codigo: values.codigo,
                    tipoAlimentacion: values.tipoAlimentacion,
                    medidaOCapacidad: values.medidaOCapacidad,
                    requiereCalibracion: values.requiereCalibracion,
                    esDePrecision: values.esDePrecision,
                    mesesGarantia: values.mesesGarantia
                };
            } else if (tipoEspecifico === 'Repuesto General') {
                datosTecnicos = {
                    ...baseEquivalencia,
                    marca: values.marca,
                    codigo: values.codigo,
                    codigoOriginal: values.codigoOriginal, 
                };
            }

            // 🔥 INYECTAMOS EL FLAG UNIVERSAL AL JSON DE DATOS TÉCNICOS 🔥
            datosTecnicos.esUniversal = values.esUniversal;

            const payload = {
                nombre: tituloEnVivo, 
                tipo: values.clasificacion.toLowerCase(),
                categoria: values.categoria,
                stockAlmacen: values.clasificacion === 'Serializado' ? values.itemsSerializados.length : values.stockAlmacen,
                stockMinimo: values.stockMinimo,
                unidadMedida: values.unidadMedida,
                precioPromedio: values.precioPromedio,
                tipoSpecifico: tipoEspecifico === 'Otro' ? 'Otros' : tipoEspecifico,
                idAlmacen: values.idAlmacen,
                idProveedor: values.idProveedor,
                estado: values.estado || 'Nuevo',
                ubicacionBase: values.ubicacionBase,
                datosTecnicos: datosTecnicos,
                itemsSerializados: values.itemsSerializados,
                // Si es universal, mandamos arreglo vacío para no asociar con nada específico
                recomendaciones: values.esUniversal ? [] : values.recomendaciones 
            };

            if (datosTecnicos.imagen && typeof datosTecnicos.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Por favor espera.', loading: true });
                const imagenFile = datosTecnicos.imagen;
                const fileExtension = imagenFile.name.split('.').pop();
                const uniqueFilename = `${values.marca}${datosTecnicos.codigo}.${fileExtension}`.replace(/\s+/g, '_');

                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, {
                    method: 'POST',
                    body: imagenFile,
                });

                if (!response.ok) console.log('Falló la subida o ya existe.');
                payload.datosTecnicos.imagen = uniqueFilename;
                notifications.update({ id: 'uploading-image', title: 'Éxito', message: 'Imagen lista.', color: 'green' });
            }

            const method = isEdit ? 'PUT' : 'POST';
            const url = isEdit ? `/api/inventario/consumibles/${values.id}` : '/api/inventario/consumibles';

            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const res = await response.json();

            if (res.success) {
                notifications.show({
                    title: 'Éxito',
                    message: `Consumible ${isEdit ? 'actualizado' : 'creado'} correctamente`,
                    color: 'green'
                });
                if (onSuccess) onSuccess(res.data);
            } else {
                throw new Error(res.error || 'Error al guardar');
            }

        } catch (error) {
            console.error(error);
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    // Helper para renderizar la caja de equivalencias
    const renderCajaEquivalencias = () => (
        <Paper withBorder p="md" bg="gray.0">
            <Text size="sm" fw={500} mb="xs">Equivalencias de Marca</Text>
            {equivalenciaSeleccionada ? (
                <Group justify="space-between">
                    <Group>
                        <IconLink size={18} color="blue" />
                        <Text size="sm">
                            Vinculado con: <b>{equivalenciaSeleccionada.nombre}</b>
                        </Text>
                    </Group>
                    <Button color="red" variant="subtle" size="xs" onClick={() => setEquivalenciaSeleccionada(null)}>
                        <IconTrash size={16} />
                    </Button>
                </Group>
            ) : (
                <Group>
                    <Alert variant="light" color="blue" title="¿Es el mismo repuesto de otra marca?" icon={<IconLink size={16} />} style={{ flex: 1 }}>
                        Si este {tipoEspecifico.toLowerCase()} es equivalente a uno existente, vincúlalos para unificar el stock.
                    </Alert>
                    <Button variant="white" onClick={() => setShowEquivalencias(true)}>
                        Buscar Equivalente
                    </Button>
                </Group>
            )}
        </Paper>
    );

    const tipoCatalogo = {
        'Aceite': 'aceite',
        'Bateria': 'bateria',
        'Neumatico': 'neumatico',
        'Correa': 'correa',
        'Filtro': 'filtro',
        'Combustible': 'combustible'
    }[tipoEspecifico] || 'general';

    const tipoFiltro = {
        'Aceite': 'filtroAceite',
        'Aire': 'filtroAire',
        'Combustible': 'filtroCombustible'
    }[form.values.tipo] || 'filtroAceite';

    return (
        <Stack pos="relative">
            <LoadingOverlay visible={loading} />

            <Paper shadow="xs" p="md" mb="md" bg="blue.0" radius="md" withBorder>
                <Text size="sm" c="blue.9" fw={600} tt="uppercase" mb={4}>
                    Previsualización del Nombre Final:
                </Text>
                <Title order={3} c="blue.9" style={{ wordBreak: 'break-word' }}>
                    {tituloEnVivo}
                </Title>
            </Paper>

            <SimpleGrid cols={2} breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
                <Select
                    label="Tipo de consumible"
                    data={['Filtro', 'Combustible', 'Aceite', 'Bateria', 'Correa', 'Neumatico', 'Manguera', 'Sensor', 'Herramienta', 'Repuesto General']}
                    value={tipoEspecifico}
                    onChange={(val) => {
                        setTipoEspecifico(val);
                        form.setValues({ ...form.values, marca: '', codigo: '', codigoOriginal: '', marcaOEM: '', codigoOEM: '' });
                    }}
                    allowDeselect={false}
                />
                <Select
                    label="Unidad de Medida"
                    disabled={esSerializado}
                    data={['unidades', 'litros', 'kilogramos', 'metros', 'galones']}
                    value={form.values.unidadMedida}
                    onChange={(val) => form.setFieldValue('unidadMedida', val)}
                />
                <Select
                    label="Clasificación"
                    disabled={tipoEspecifico !== 'Herramienta' && tipoEspecifico !== 'Repuesto General'}
                    data={['Fungible', 'Serializado']}
                    value={form.values.clasificacion}
                    onChange={(val) => {
                        setEsSerializado(val === 'Serializado');
                        form.setFieldValue('clasificacion', val);
                        if (val === 'Serializado') form.setFieldValue('stockAlmacen', 1);
                    }}
                />
            </SimpleGrid>

            <Divider />

            <form onSubmit={(e) => { e.stopPropagation(); form.onSubmit(handleSubmit)(e); }}>
                <Stack gap="md">

                    <AsyncCatalogComboBox
                        key={tipoCatalogo}
                        label="Marca"
                        placeholder="Selecciona una marca"
                        fieldKey="marca"
                        form={form}
                        catalogo="marcas"
                        tipo={tipoCatalogo}
                    />
                    {['Correa', 'Sensor', 'Filtro'].includes(tipoEspecifico) && (
                        <Group grow>
                            <TextInput
                                label="Nombre / Descripción"
                                placeholder="Ej: Amortiguador delantero"
                                description="No incluyas el modelo del vehículo, se añadirá automáticamente."
                                {...form.getInputProps('nombre')}
                            />
                        </Group>
                    )}

                    {tipoEspecifico === 'Repuesto General' && (
                        <>
                            <Group grow>
                                <TextInput
                                    label="Nombre / Descripción del Repuesto"
                                    placeholder="Ej: Amortiguador de cabina"
                                    description="No incluyas el modelo del vehículo."
                                    {...form.getInputProps('nombre')}
                                />
                                <AsyncCatalogComboBox
                                    key={tipoCatalogo}
                                    label="Marca de este repuesto"
                                    placeholder="Ej: Monroe"
                                    fieldKey="marca"
                                    form={form}
                                    catalogo="marcas"
                                    tipo={tipoCatalogo}
                                />
                            </Group>
                            <Group grow>
                                <TextInput 
                                    label="Código Original (OEM) Adicional" 
                                    placeholder="Opcional. Ej: Mack 85134263" 
                                    {...form.getInputProps('codigoOriginal')} 
                                />
                                <TextInput 
                                    label="Código del Fabricante" 
                                    placeholder="Ej: 65148" 
                                    {...form.getInputProps('codigo')} 
                                />
                            </Group>
                            {renderCajaEquivalencias()}
                        </>
                    )}

                    {tipoEspecifico === 'Manguera' && (
                        <Group grow align="flex-start">
                            <TextInput
                                label="Diámetro"
                                placeholder="Ej: 1/2, 5/8, 1"
                                rightSection={<Text size="xs" c="dimmed" mr="xs">pulg.</Text>}
                                {...form.getInputProps('diametro')}
                            />
                            <NumberInput
                                label="Longitud"
                                placeholder="Ej: 150"
                                suffix=" cm"
                                min={1}
                                {...form.getInputProps('longitud')}
                            />
                            <TextInput
                                label="Conectores (Opcional)"
                                placeholder="Ej: Recto JIC x Curvo 90°"
                                {...form.getInputProps('conectores')}
                            />
                        </Group>
                    )}

                    {tipoEspecifico === 'Filtro' && (
                        <>
                            <Group grow mt="sm">
                                <Select label="Función" placeholder="seleccione un tipo" data={['Aceite', 'Aire', 'Combustible']} {...form.getInputProps('tipo')} />
                                <AsyncCatalogComboBox
                                    key={tipoFiltro}
                                    disabled={!form.values.categoria}
                                    label="Código"
                                    placeholder="Ej. WF1036"
                                    fieldKey="codigo"
                                    form={form}
                                    catalogo="codigos"
                                    tipo={tipoFiltro}
                                />
                                <Select label="Posición" data={['Primario', 'Secundario']} {...form.getInputProps('posicion')} />
                                <ImageDropzone
                                    label="Imagen del Filtro" form={form} fieldPath="imagen"
                                />
                            </Group>
                            {renderCajaEquivalencias()}
                        </>
                    )}

                    {tipoEspecifico === 'Aceite' && (
                        <Group grow>
                            <AsyncCatalogComboBox
                                label="Modelo"
                                placeholder="X-cess 8100"
                                fieldKey="modelo"
                                form={form}
                                catalogo="modelos"
                                tipo={tipoCatalogo}
                            />
                            <AsyncCatalogComboBox
                                label="Viscosidad"
                                placeholder="Ej. 15W-40"
                                fieldKey="viscosidad"
                                form={form}
                                catalogo="viscosidades"
                                tipo='motor'
                            />
                            <Select label="Base" data={['mineral', 'sintético', 'semi']} {...form.getInputProps('tipoAceite')} />
                            <Select label="Aplicación" data={['motor', 'hidraulico']} {...form.getInputProps('aplicacion')} />
                        </Group>
                    )}

                    {tipoEspecifico === 'Bateria' && (
                        <Group grow>
                            <AsyncCatalogComboBox
                                label="Grupo/Código"
                                placeholder="Ej. 24F"
                                fieldKey="codigo"
                                form={form}
                                catalogo="codigos"
                                tipo="bateria"
                            />
                            <NumberInput label="CCA (Arranque)" suffix=" A" {...form.getInputProps('amperaje')} />
                            <NumberInput label="Capacidad" suffix=" Ah" {...form.getInputProps('capacidad')} />
                            <NumberInput label="Voltaje" suffix=" V" {...form.getInputProps('voltaje')} />
                        </Group>
                    )}

                    {tipoEspecifico === 'Neumatico' && (
                        <Group grow>
                            <AsyncCatalogComboBox label="Modelo" fieldKey="modelo" form={form} catalogo="modelos" tipo="neumatico" />
                            <AsyncCatalogComboBox label="Medida" fieldKey="medida" form={form} catalogo="medida-neumaticos" />
                            <Checkbox label="¿Neumático con cámara?" {...form.getInputProps('esTubeless', { type: 'checkbox' })} />
                            <Checkbox label="¿Neumático recauchable?" {...form.getInputProps('esRecauchable', { type: 'checkbox' })} />
                        </Group>
                    )}

                    {tipoEspecifico === 'Correa' && (
                        <>
                            <Group grow>
                                <TextInput label="Código/Medida" placeholder="6PK2240" {...form.getInputProps('codigo')} />
                            </Group>
                            {renderCajaEquivalencias()}
                        </>
                    )}

                    {tipoEspecifico === 'Sensor' && (
                        <>
                            <Group grow>
                                <TextInput 
                                    label="Código de Parte / Referencia" 
                                    placeholder="Ej: 85134263" 
                                    {...form.getInputProps('codigo')} 
                                />
                            </Group>
                            {renderCajaEquivalencias()}
                        </>
                    )}

                    {tipoEspecifico === 'Combustible' && (
                        <>
                            <Group grow align="flex-start">
                                <TextInput 
                                    label="Nombre Identificador" 
                                    placeholder="Ej: Tanque Principal Gasoil" 
                                    description="No incluyas el modelo del vehículo."
                                    {...form.getInputProps('nombre')} 
                                />
                                <Select
                                    label="Tipo de Fluido/Gas"
                                    placeholder="Ej: Gasoil"
                                    data={[
                                        { value: 'gasoil', label: 'Gasoil' },
                                        { value: 'gasolina', label: 'Gasolina' },
                                        { value: 'kerosene', label: 'Kerosene' },
                                        { value: 'oxigeno', label: 'Oxígeno' },
                                        { value: 'nitrogeno', label: 'Nitrógeno' },
                                        { value: 'argon', label: 'Argón' },
                                        { value: 'propano', label: 'Propano' },
                                        { value: 'butano', label: 'Butano' },
                                        { value: 'gnv', label: 'GNV' },
                                        { value: 'glp', label: 'GLP' }
                                    ]}
                                    required
                                    {...form.getInputProps('categoria')}
                                />
                                <Select
                                    label="Forma Geométrica del Tanque/Cilindro"
                                    placeholder="Seleccione la forma"
                                    data={[
                                        { value: 'cuadrado', label: 'Cuadrado / Rectangular' },
                                        { value: 'cilindrico_acostado', label: 'Cilíndrico Acostado' },
                                        { value: 'cilindrico_parado', label: 'Cilíndrico Parado' }
                                    ]}
                                    {...form.getInputProps('tipoTanque')}
                                />
                            </Group>

                            {form.values.tipoTanque === 'cuadrado' && (
                                <Group grow>
                                    <NumberInput label="Largo (cm)" min={0} {...form.getInputProps('tanqueLargo')} />
                                    <NumberInput label="Ancho (cm)" min={0} {...form.getInputProps('tanqueAncho')} />
                                    <NumberInput label="Alto (cm)" min={0} {...form.getInputProps('tanqueAlto')} />
                                </Group>
                            )}

                            {(form.values.tipoTanque === 'cilindrico_acostado' || form.values.tipoTanque === 'cilindrico_parado') && (
                                <Group grow>
                                    <NumberInput label="Radio (cm)" min={0} {...form.getInputProps('tanqueRadio')} />
                                    <NumberInput
                                        label={form.values.tipoTanque === 'cilindrico_acostado' ? "Largo (cm)" : "Alto (cm)"}
                                        min={0}
                                        {...form.getInputProps('tanqueLargo')}
                                    />
                                </Group>
                            )}

                            {form.values.tipoTanque && (
                                <NumberInput
                                    label="Capacidad Total Calculada (Litros)"
                                    min={0}
                                    precision={2}
                                    description="Se calcula automáticamente según las dimensiones o puedes ajustarlo."
                                    {...form.getInputProps('capacidadTotalLitros')}
                                />
                            )}
                        </>
                    )}

                    {tipoEspecifico === 'Herramienta' && (
                        <>
                            <Stack gap="md">
                                <TextInput
                                    label="Nombre del Insumo / Herramienta"
                                    placeholder="Ej: Taladro Percutor Dewalt 20V"
                                    description="No incluyas el modelo del vehículo."
                                    required
                                    {...form.getInputProps('nombre')}
                                />
                                <Select
                                    label="Tipo de Alimentación"
                                    data={['Manual', 'Electrica_110V', 'Electrica_220V', 'Bateria', 'Neumatica', 'Hidraulica']}
                                    {...form.getInputProps('tipoAlimentacion')}
                                />
                                <TextInput
                                    label="Medida o Capacidad (Opcional)"
                                    placeholder="Ej: 1/2 pulgada, 20 Toneladas, 1200W"
                                    {...form.getInputProps('medidaOCapacidad')}
                                />
                                <TextInput
                                    label="Modelo / Código de Fábrica"
                                    placeholder="Ej: DCD771C2"
                                    {...form.getInputProps('codigo')}
                                />
                            </Stack>

                            {form.values.clasificacion === 'Serializado' && (
                                <Group grow mt="sm">
                                    <NumberInput
                                        label="Meses de Garantía"
                                        placeholder="0"
                                        min={0}
                                        {...form.getInputProps('mesesGarantia')}
                                    />
                                    <Paper withBorder p="xs" radius="md">
                                        <Stack gap="xs">
                                            <Checkbox label="¿Requiere Calibración Anual?" {...form.getInputProps('requiereCalibracion', { type: 'checkbox' })} />
                                            <Checkbox label="¿Es equipo de alta precisión?" {...form.getInputProps('esDePrecision', { type: 'checkbox' })} />
                                        </Stack>
                                    </Paper>
                                </Group>
                            )}
                        </>
                    )}
                    
                    <Divider label="Asignación a Vehículos / Subsistemas" labelPosition="center" mt="xl" />
                    <Paper withBorder p="md" bg="gray.0" radius="md">
                        <Stack>
                            {/* 🔥 INTERRUPTOR PARA HACERLO UNIVERSAL 🔥 */}
                            <Switch 
                                size="md" 
                                color="green"
                                label="¿Es un repuesto de uso universal?"
                                description="Activa esto si el repuesto aplica para absolutamente cualquier activo de la flota (Ej. Faldones, tirrajes, grasa)."
                                {...form.getInputProps('esUniversal', { type: 'checkbox' })}
                                onChange={(e) => {
                                    form.getInputProps('esUniversal').onChange(e);
                                    if(e.currentTarget.checked) {
                                        form.setFieldValue('recomendaciones', []); 
                                    }
                                }}
                            />

                            {!form.values.esUniversal && (
                                <>
                                    <Group align="flex-end">
                                        <Select
                                            label="1. Modelo de Vehículo"
                                            placeholder="Selecciona el vehículo"
                                            data={listaVehiculos}
                                            value={selectedVehiculo}
                                            onChange={setSelectedVehiculo}
                                            searchable
                                            style={{ flex: 1 }}
                                        />
                                        <Select
                                            label="2. Subsistema"
                                            placeholder="Selecciona el subsistema"
                                            data={listaSubsistemas}
                                            value={selectedSubsistema}
                                            onChange={setSelectedSubsistema}
                                            disabled={!selectedVehiculo}
                                            searchable
                                            style={{ flex: 1 }}
                                        />
                                        <NumberInput
                                            label="Cant. por Vehículo"
                                            value={cantidadAsignacion}
                                            onChange={setCantidadAsignacion}
                                            min={1}
                                            style={{ width: 140 }}
                                        />
                                        <Button 
                                            onClick={handleAddRecomendacion} 
                                            leftSection={<IconPlus size={16} />}
                                        >
                                            Añadir
                                        </Button>
                                    </Group>

                                    {form.values.recomendaciones.length > 0 ? (
                                        <Table striped highlightOnHover withTableBorder mt="md">
                                            <Table.Thead bg="white">
                                                <Table.Tr>
                                                    <Table.Th>Vehículo</Table.Th>
                                                    <Table.Th>Subsistema</Table.Th>
                                                    <Table.Th>Cantidad Recomendada</Table.Th>
                                                    <Table.Th style={{ width: 80 }}>Acción</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {form.values.recomendaciones.map((rec, index) => (
                                                    <Table.Tr key={index}>
                                                        <Table.Td>{rec.vehiculoNombre}</Table.Td>
                                                        <Table.Td>{rec.subsistemaNombre}</Table.Td>
                                                        <Table.Td>{rec.cantidad} {form.values.unidadMedida}</Table.Td>
                                                        <Table.Td>
                                                            <ActionIcon color="red" variant="subtle" onClick={() => handleRemoveRecomendacion(index)}>
                                                                <IconTrash size={18} />
                                                            </ActionIcon>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    ) : (
                                        <Alert color="gray" mt="sm">No hay asignaciones registradas. Si no agregas ninguna, asegúrate de marcar el interruptor de "Uso Universal" arriba.</Alert>
                                    )}
                                </>
                            )}
                        </Stack>
                    </Paper>

                    <Divider label="Inventario" labelPosition="center" mt="xl"/>
                    <TextInput
                        label="Ubicación Base (Catálogo)"
                        placeholder="Ej: Almacén Central - Estante A"
                        description="Dónde se almacena regularmente"
                        {...form.getInputProps('ubicacionBase')}
                    />
                    <NumberInput
                        label="Precio Promedio Unitario"
                        min={0}
                        precision={2}
                        step={0.01}
                        prefix="$"
                        {...form.getInputProps('precioPromedio')}
                    />
                    <NumberInput
                        label="Stock Mínimo"
                        min={0}
                        {...form.getInputProps('stockMinimo')}
                    />
                    <NumberInput
                        label={esSerializado ? "Cantidad a Ingresar (Unidades)" : "Stock Almacen"}
                        min={esSerializado ? 1 : 0}
                        disabled={isEdit && !esSerializado}
                        {...form.getInputProps('stockAlmacen')}
                    />

                    {esSerializado && (
                        <>
                            <Alert variant="light" color="blue" title="Detalle de Seriales" icon={<IconInfoCircle size={16} />}>
                                {isEdit ? "Gestione los seriales existentes." : "Ingrese los datos únicos de cada unidad."}
                            </Alert>

                            <SerializadosInputs
                                cantidad={form.values.stockAlmacen}
                                values={form.values.itemsSerializados}
                                form={form}
                                onChange={(newItems) => form.setFieldValue('itemsSerializados', newItems)}
                                esRecauchable={form.values.esRecauchable}
                            />
                        </>
                    )}

                    <Group justify="right" mt="xl">
                        {onCancel && <Button variant="default" onClick={onCancel} type="button">Cancelar</Button>}
                        <Button type="submit" leftSection={<IconDeviceFloppy size={18} />}>
                            {isEdit ? 'Actualizar Repuesto' : 'Guardar Repuesto'}
                        </Button>
                    </Group>
                </Stack>
            </form>
            <ModalEquivalencias
                open={showEquivalencias}
                onClose={() => setShowEquivalencias(false)}
                tipo={tipoEspecifico}
                onConfirm={handleConfirmEquivalencia}
                initialSelected={equivalenciaSeleccionada ? [equivalenciaSeleccionada.id] : []}
            />
        </Stack>
    );
}