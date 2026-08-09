"use client";

import { useState, useMemo, useEffect } from "react";
import {
    Paper, Group, Title, Button, Modal, Select, TextInput,
    SimpleGrid, Card, Text, Badge, Image, Stack, ActionIcon,
    Box, LoadingOverlay, Alert, Loader, ThemeIcon
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import {
    IconPlus, IconTrash, IconAlertCircle,
    IconStethoscope, IconSteeringWheel, IconId, IconScan, IconCheck
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import ImageDropzone from "@/app/components/ImageDropzone";

export default function DocumentosManager({ empleadoId, documentos = [], puestos = [] }) {
    const router = useRouter();
    const [opened, setOpened] = useState(false);
    const [loading, setLoading] = useState(false);
    
    // Estado específico para el análisis de IA
    const [ocrLoading, setOcrLoading] = useState(false);

    const form = useForm({
        initialValues: {
            tipo: 'Licencia',
            gradoLicencia: null,
            numeroDocumento: '',
            fechaVencimiento: null,
            imagen: null
        },
        validate: {
            fechaVencimiento: (value) => value ? null : 'La fecha es obligatoria',
            gradoLicencia: (value, values) =>
                (values.tipo === 'Licencia' || values.tipo === 'CertificadoMedico') && !value
                    ? 'El grado es requerido' : null,
            tipo: (value) => value ? null : 'Tipo requerido'
        }
    });

    // Detectar si es Chofer para las alertas
    const esChofer = useMemo(() => {
        if (!puestos || puestos.length === 0) return false;
        return puestos.some(p => {
            const nombrePuesto = typeof p === 'string' ? p : p.nombre || '';
            return /chofer|conductor|transportista/i.test(nombrePuesto);
        });
    }, [puestos]);

    // -----------------------------------------------------------
    // EFECTO PRINCIPAL: DETECTAR DROP DE IMAGEN Y DISPARAR OCR
    // -----------------------------------------------------------
    useEffect(() => {
        const file = form.values.imagen;

        // Validamos que sea un archivo real y no un string (URL)
        if (file && typeof file !== 'string' && typeof file === 'object' && typeof file.arrayBuffer === 'function') {
            handleAnalyzeImage(file);
        }
    }, [form.values.imagen]);

    // Función que llama a la API de IA
    const handleAnalyzeImage = async (file) => {
        setOcrLoading(true);
        notifications.show({
            id: 'ocr-status',
            title: 'Analizando con IA...',
            message: 'Detectando tipo, grado y vencimiento...',
            loading: true,
            autoClose: false
        });

        try {
            const formData = new FormData();
            formData.append("file", file);

            // Fetch a tu endpoint de API (Backend)
            const res = await fetch("/api/ocr", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) throw new Error("Fallo al analizar imagen");

            const data = await res.json();
            console.log("IA Resultado:", data);

            // --- ACTUALIZACIÓN DE VALORES DEL FORMULARIO ---
            
            // 1. Tipo de Documento
            if (data.tipo && data.tipo !== 'Otro') {
                form.setFieldValue('tipo', data.tipo);
            }

            // 2. Grado (1-5)
            if (data.gradoLicencia) {
                // Aseguramos que sea string numérico '1', '2', '3', '4', '5'
                const gradoStr = String(data.gradoLicencia).replace(/\D/g, '');
                form.setFieldValue('gradoLicencia', gradoStr);
            }

            // 3. Número
            if (data.numeroDocumento) {
                form.setFieldValue('numeroDocumento', data.numeroDocumento);
            }

            // 4. Fecha Vencimiento
            if (data.fechaVencimiento) {
                // Convertir string "YYYY-MM-DD" a objeto Date (Mantine lo requiere así)
                const [y, m, d] = data.fechaVencimiento.split('-').map(Number);
                // Usamos constructor con hora 12 para evitar problemas de zona horaria
                const fechaObj = new Date(y, m - 1, d, 12, 0, 0);
                form.setFieldValue('fechaVencimiento', fechaObj);
            }

            notifications.update({
                id: 'ocr-status',
                title: 'Datos completados',
                message: `Detectado: ${data.tipo} ${data.gradoLicencia ? `de ${data.gradoLicencia}°` : ''}`,
                color: 'green',
                icon: <IconCheck />,
                loading: false,
                autoClose: 4000
            });

        } catch (error) {
            console.error("Error OCR:", error);
            notifications.update({
                id: 'ocr-status',
                title: 'No se pudo leer',
                message: 'Por favor completa los datos manualmente.',
                color: 'orange',
                loading: false,
                autoClose: 3000
            });
        } finally {
            setOcrLoading(false);
        }
    };

    // --- REVISIÓN DE FALTANTES ---
    const faltantes = useMemo(() => {
        const docs = documentos || [];
        const missing = [];
        if (!docs.some(d => d.tipo === 'Cedula')) missing.push('Cédula');
        if (!docs.some(d => d.tipo === 'RIF')) missing.push('RIF');
        if (esChofer) {
            if (!docs.some(d => d.tipo === 'Licencia' && String(d.gradoLicencia) === '5')) missing.push('Licencia 5°');
            if (!docs.some(d => d.tipo === 'CertificadoMedico' && String(d.gradoLicencia) === '5')) missing.push('Cert. Médico 5°');
        }
        return missing;
    }, [documentos, esChofer]);

    // Subida de imagen a Blob (Se ejecuta al guardar)
    const handleUploadImage = async (file) => {
        const filename = `${empleadoId}-${Date.now()}.${file.name.split('.').pop()}`;
        const response = await fetch(`/api/upload?filename=${filename}`, { method: 'POST', body: file });
        const blob = await response.json();
        return blob.url;
    };

    // Submit Final
    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            let payload = {
                empleadoId,
                ...values,
                fechaVencimiento: values.fechaVencimiento.toISOString().split('T')[0]
            };

            // Subir imagen si es un archivo nuevo
           if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Por favor espera.', loading: true });
                const imagenFile = values.imagen;
                const fileExtension = imagenFile.name.split('.').pop();
                const uniqueFilename = `${empleadoId}${values.tipo.replace(/\s+/g, '_')}${values.gradoLicencia || ""}.${fileExtension}`;

                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, {
                    method: 'POST',
                    body: imagenFile,
                });

                if (!response.ok) console.log('Falló la subida de la imagen. Probablemente ya exista una con ese nombre.');
                const newBlob = await response.json();
                payload.imagen = `${empleadoId}${values.tipo.replace(/\s+/g, '_')}${values.gradoLicencia || ""}.${fileExtension}`;
                notifications.update({ id: 'uploading-image', title: 'Éxito', message: 'Imagen subida.', color: 'green' });
            }

            const res = await fetch('/api/rrhh/documentos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Error guardando");

            notifications.show({ message: 'Documento registrado', color: 'green' });
            setOpened(false);
            form.reset();
            form.setValues({ tipo: 'Licencia', gradoLicencia: null, numeroDocumento: '', fechaVencimiento: null, imagen: null });
            router.refresh();

        } catch (error) {
            console.error(error);
            notifications.show({ message: 'Error al guardar', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleEliminar = async (id) => {
        if (!confirm("¿Borrar documento permanentemente?")) return;
        try {
            await fetch(`/api/rrhh/documentos?id=${id}`, { method: 'DELETE' });
            router.refresh();
        } catch (error) { console.error(error); }
    };

    const getIcon = (tipo) => {
        if (tipo === 'Licencia') return <IconSteeringWheel size={20} />;
        if (tipo === 'CertificadoMedico') return <IconStethoscope size={20} />;
        return <IconId size={20} />;
    };

    const isVencido = (fecha) => new Date(fecha) < new Date();

    return (
        <Paper withBorder p="md" radius="md" mt="lg">
            <Group justify="space-between" mb="md">
                <Group gap="xs">
                    <Title order={4}>Documentación Legal</Title>
                    {esChofer && <Badge color="orange" variant="light">Perfil Chofer</Badge>}
                </Group>
                <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>
                    Agregar Documento
                </Button>
            </Group>

            {faltantes.length > 0 && (
                <Alert variant="light" color="red" title="Documentación Incompleta" icon={<IconAlertCircle />} mb="md">
                    <Stack gap={4}>
                        <Text size="sm">Faltan documentos obligatorios{esChofer ? " para Chofer" : ""}:</Text>
                        <Group gap="xs">
                            {faltantes.map(f => <Badge key={f} color="red" variant="dot">{f}</Badge>)}
                        </Group>
                    </Stack>
                </Alert>
            )}

            {documentos.length === 0 ? (
                <Paper withBorder p="xl" bg="gray.0" ta="center">
                    <ThemeIcon size={60} radius="md" variant="light" color="blue" mb="md"><IconId size={40} /></ThemeIcon>
                    <Title order={5}>Legajo Digital Vacío</Title>
                    <Text c="dimmed" size="sm" mb="md">Carga los documentos obligatorios.</Text>
                    <Button onClick={() => setOpened(true)}>Cargar Primer Documento</Button>
                </Paper>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                    {documentos.map((doc) => {
                        const vencido = isVencido(doc.fechaVencimiento);
                        const esGrado = doc.tipo === 'Licencia' || doc.tipo === 'CertificadoMedico';

                        return (
                            <Card key={doc.id} padding="sm" radius="md" withBorder style={{ borderColor: vencido ? 'red' : undefined }}>
                                <Group justify="space-between" mb="xs">
                                    <Group gap={5}>
                                        <Badge
                                            color={doc.tipo === 'Licencia' ? 'blue' : doc.tipo === 'CertificadoMedico' ? 'teal' : 'gray'}
                                            variant="light"
                                            leftSection={getIcon(doc.tipo)}
                                        >
                                            {doc.tipo === 'CertificadoMedico' ? 'Cert. Médico' : doc.tipo}
                                        </Badge>
                                        {esGrado && doc.gradoLicencia && <Badge color="dark" variant="filled" size="sm">{doc.gradoLicencia}°</Badge>}
                                    </Group>
                                    <ActionIcon color="red" variant="subtle" size="sm" onClick={() => handleEliminar(doc.id)}><IconTrash size={14} /></ActionIcon>
                                </Group>

                                <Box bg="gray.1" style={{ borderRadius: 8, overflow: 'hidden', height: 120, position: 'relative' }} mb="sm">
                                    <Stack align="center" justify="center" h="100%">
                                        {doc.imagen ? (
                                            <Image src={process.env.NEXT_PUBLIC_BLOB_BASE_URL + "/" + doc.imagen + `?v=${process.env.NEXT_PUBLIC_APP_VERSION}` } fit="contain" h="100%" w="100%" alt="Doc" />
                                        ) : (
                                            <>
                                                {getIcon(doc.tipo)}
                                                <Text size="xs" c="dimmed">Sin Imagen</Text>
                                            </>
                                        )}
                                    </Stack>
                                    {vencido && (
                                        <Box style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Badge color="red" variant="filled">VENCIDO</Badge>
                                        </Box>
                                    )}
                                </Box>

                                <Stack gap={2}>
                                    <Text size="sm" fw={700} c={vencido ? 'red' : 'dark'}>{doc.fechaVencimiento}</Text>
                                    {doc.numeroDocumento && (
                                        <Text size="xs" c="dimmed">Ref: {doc.numeroDocumento}</Text>
                                    )}
                                </Stack>
                            </Card>
                        );
                    })}
                </SimpleGrid>
            )}

            {/* MODAL FORMULARIO */}
            <Modal opened={opened} onClose={() => { setOpened(false); form.reset(); }} title="Registrar Documento" centered size="md">
                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack pos="relative">
                        <LoadingOverlay visible={loading || ocrLoading} overlayProps={{ blur: 2 }}
                            loaderProps={ocrLoading ? { children: <Stack align="center" gap="xs"><Loader variant="dots" /><Text size="xs" fw={700}>Analizando con IA...</Text></Stack> } : undefined}
                        />

                        <Alert variant="light" color="blue" title="Lectura Inteligente" icon={<IconScan size={16} />}>
                            <Text size="xs">Sube la imagen para autocompletar el formulario.</Text>
                        </Alert>

                        {/* DROPZONE: ESTA ES LA PROP QUE SOLICITASTE EXACTAMENTE */}
                        <ImageDropzone
                            label="Subir Imagen del Documento"
                            form={form}
                            fieldPath="imagen"
                        />

                        {/* RENDERIZADO CONDICIONAL: Solo mostramos los campos si hay imagen cargada */}
                        {form.values.imagen && (
                            <>
                                <Group grow align="flex-start">
                                    <Select
                                        label="Tipo"
                                        data={[
                                            { value: 'Licencia', label: 'Licencia' },
                                            { value: 'CertificadoMedico', label: 'Cert. Médico' },
                                            { value: 'Cedula', label: 'Cédula' },
                                            { value: 'RIF', label: 'RIF' },
                                            { value: 'Otro', label: 'Otro' },
                                        ]}
                                        {...form.getInputProps('tipo')}
                                    />
                                    {(form.values.tipo === 'Licencia' || form.values.tipo === 'CertificadoMedico') && (
                                        <Select
                                            label="Grado"
                                            // AHORA SOPORTA DE 1 a 5
                                            data={['1', '2', '3', '4', '5']}
                                            withAsterisk
                                            {...form.getInputProps('gradoLicencia')}
                                        />
                                    )}
                                </Group>

                                <TextInput
                                    label="Número de Documento"
                                    placeholder="C.I. o RIF"
                                    rightSection={ocrLoading ? <Loader size="xs" /> : form.values.numeroDocumento ? <IconCheck color="green" size={16} /> : null}
                                    {...form.getInputProps('numeroDocumento')}
                                />

                                <DateInput
                                    label="Fecha de Vencimiento"
                                    placeholder="DD/MM/AAAA"
                                    valueFormat="DD/MM/YYYY"
                                    withAsterisk
                                    rightSection={ocrLoading ? <Loader size="xs" /> : form.values.fechaVencimiento ? <IconCheck color="green" size={16} /> : null}
                                    {...form.getInputProps('fechaVencimiento')}
                                />
                            </>
                        )}

                        <Button fullWidth mt="md" type="submit" loading={loading} disabled={ocrLoading}>
                            Guardar Documento
                        </Button>
                    </Stack>
                </form>
            </Modal>
        </Paper>
    );
}