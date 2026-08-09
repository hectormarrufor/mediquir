//app/components/ImageDropzone.jsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Group, Text, Image, Box, Paper, Center, Loader, Stack, Modal, ActionIcon, Button } from '@mantine/core';
import { IconPhoto, IconReload, IconCamera, IconCheck, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import imageCompression from 'browser-image-compression';
import dynamic from 'next/dynamic';
import 'cropperjs/dist/cropper.css';

const Cropper = dynamic(() => import('react-cropper'), { ssr: false });

export default function ImageDropzone({ label, form, fieldPath }) {
    const [preview, setPreview] = useState(null);
    const [compressing, setCompressing] = useState(false);
    
    const galleryInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const cropperRef = useRef(null);

    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [tempImageSrc, setTempImageSrc] = useState(null);
    const [aspect, setAspect] = useState(4 / 3);

    const currentValue = form.values[fieldPath];

    useEffect(() => {
        if (!currentValue) {
            setPreview(null);
            return;
        }

        // 🔥 SOLUCIÓN: Agregamos "instanceof Blob" porque el compresor devuelve un Blob
        if (typeof currentValue === 'object' && (currentValue instanceof File || currentValue instanceof Blob)) {
             const objectUrl = URL.createObjectURL(currentValue);
             setPreview(objectUrl);
             return () => URL.revokeObjectURL(objectUrl);
        }
        
        if (typeof currentValue === 'string' && currentValue.startsWith('http')) {
            setPreview(currentValue);
        } else if (typeof currentValue === "string") {
            const baseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL || '';
            const version = process.env.NEXT_PUBLIC_APP_VERSION || Date.now();
            setPreview(`${baseUrl}/${currentValue}?v=${version}`);
        }
    }, [currentValue]);
    
    const processFile = (file) => {
        if (!file) return;
        const imageDataUrl = URL.createObjectURL(file);
        setTempImageSrc(imageDataUrl);
        setCropModalOpen(true);
        setAspect(4 / 3);
        
        if (galleryInputRef.current) galleryInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (file) processFile(file);
    };

    const handleSetAspect = (newAspect) => {
        setAspect(newAspect);
        const cropper = cropperRef.current?.cropper;
        if (cropper) {
            cropper.setAspectRatio(newAspect);
        }
    };

    const handleSaveCrop = async () => {
        const cropper = cropperRef.current?.cropper;
        if (!cropper) return;

        setCropModalOpen(false);
        setCompressing(true);
        
        notifications.show({
            id: 'compressing-image',
            title: 'Procesando',
            message: 'Optimizando imagen...',
            loading: true,
            autoClose: false,
        });

        try {
            cropper.getCroppedCanvas().toBlob(async (blob) => {
                if (!blob) throw new Error('No se pudo generar el recorte');
                
                const croppedFile = new File([blob], "document.jpg", { type: "image/jpeg" });
                const options = {
                    maxSizeMB: 0.2,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                };

                const finalFile = await imageCompression(croppedFile, options);
                form.setFieldValue(fieldPath, finalFile);

                notifications.update({
                    id: 'compressing-image',
                    title: 'Listo',
                    message: 'Imagen ajustada con éxito.',
                    color: 'green',
                    autoClose: 2000,
                });
                setCompressing(false);
            }, 'image/jpeg', 0.95);

        } catch (error) {
            notifications.update({
                id: 'compressing-image',
                title: 'Error',
                message: 'No se pudo procesar la imagen.',
                color: 'red',
            });
            console.error("Error en recorte/compresión:", error);
            setCompressing(false);
        }
    };

    const handleCancelCrop = () => {
        setCropModalOpen(false);
        setTempImageSrc(null);
    };

    return (
        <Box mt={15} p="md" style={{ borderRadius: '8px', backgroundColor: '#f8f9fa', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)', border: '1px solid #585858ff' }}>
            
            <input type="file" accept="image/*" ref={galleryInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

            {/* --- MODAL PANTALLA COMPLETA CORREGIDO --- */}
            <Modal 
                opened={cropModalOpen} 
                onClose={handleCancelCrop} 
                withCloseButton={false}
                fullScreen
                padding={0}
                styles={{ 
                    body: { height: '100vh', backgroundColor: '#000', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
                    content: { backgroundColor: '#000' }
                }}
            >
                <Box pos="relative" style={{ flex: 1, width: '100%', height: '100vh' }}>
                    {tempImageSrc && (
                        <Cropper
                            ref={cropperRef}
                            src={tempImageSrc}
                            style={{ height: '100%', width: '100%', backgroundColor: '#000' }}
                            initialAspectRatio={4 / 3}
                            aspectRatio={aspect}
                            guides={true}
                            viewMode={1}
                            dragMode="crop"
                            scalable={true}
                            zoomOnWheel={true}
                            cropBoxMovable={true}
                            cropBoxResizable={true}
                            checkCrossOrigin={false}
                        />
                    )}

                    {/* BARRA SUPERIOR: SELECTOR DE PROPORCIÓN */}
                    <Box style={{ position: 'absolute', top: 20, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '8px', zIndex: 1000, padding: '0 10px', flexWrap: 'wrap' }}>
                        <Button 
                            size="compact-sm" 
                            variant={aspect === 4 / 3 ? 'filled' : 'light'} 
                            color={aspect === 4 / 3 ? 'yellow' : 'gray'}
                            onClick={() => handleSetAspect(4 / 3)}
                        >
                            4:3
                        </Button>
                        <Button 
                            size="compact-sm" 
                            variant={aspect === 16 / 9 ? 'filled' : 'light'} 
                            color={aspect === 16 / 9 ? 'yellow' : 'gray'}
                            onClick={() => handleSetAspect(16 / 9)}
                        >
                            16:9
                        </Button>
                        <Button 
                            size="compact-sm" 
                            variant={aspect === 3 / 4 ? 'filled' : 'light'} 
                            color={aspect === 3 / 4 ? 'yellow' : 'gray'}
                            onClick={() => handleSetAspect(3 / 4)}
                        >
                            3:4
                        </Button>
                        <Button 
                            size="compact-sm" 
                            variant={aspect === 1 ? 'filled' : 'light'} 
                            color={aspect === 1 ? 'yellow' : 'gray'}
                            onClick={() => handleSetAspect(1)}
                        >
                            1:1
                        </Button>
                        <Button 
                            size="compact-sm" 
                            variant={Number.isNaN(aspect) ? 'filled' : 'light'} 
                            color={Number.isNaN(aspect) ? 'yellow' : 'gray'}
                            onClick={() => handleSetAspect(NaN)}
                        >
                            Libre
                        </Button>
                    </Box>

                    {/* BOTONES INFERIORES */}
                    <Box style={{ position: 'absolute', bottom: 30, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '30px', zIndex: 1000 }}>
                        <ActionIcon 
                            size={60} 
                            radius="xl" 
                            color="red" 
                            variant="filled" 
                            onClick={handleCancelCrop}
                            style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}
                        >
                            <IconX size={28} color="white" />
                        </ActionIcon>
                        <ActionIcon 
                            size={60} 
                            radius="xl" 
                            color="teal" 
                            variant="filled" 
                            onClick={handleSaveCrop}
                            style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}
                        >
                            <IconCheck size={28} color="white" />
                        </ActionIcon>
                    </Box>
                </Box>
            </Modal>

            {/* --- PREVIEW O BOTONES DE ACCIÓN --- */}
            {preview && !compressing && (
                <Paper p="sm" mt="xs" radius="md">
                    <Stack align="center">
                        <Image 
                            src={preview} 
                            maw={250} 
                            radius="md" 
                            fallbackSrc="https://placehold.co/400x300?text=Error+Cargando+Imagen" 
                        />
                        <Button 
                            variant="light" 
                            leftSection={<IconReload size={16} />}
                            onClick={() => form.setFieldValue(fieldPath, null)} 
                        >
                            Cambiar imagen
                        </Button>
                    </Stack>
                </Paper>
            )}

            {!preview && (
                <Box py="xl">
                    <Group justify="center" mb="md">
                        <Stack align="center" gap="xs">
                            <IconPhoto size="3.2rem" stroke={1.5} color="gray" />
                            <Text size="sm" c="dimmed">Sube o fotografía un documento</Text>
                        </Stack>
                    </Group>

                    <Group justify="center" gap="md">
                        <Button 
                            variant="filled" 
                            color="blue" 
                            leftSection={<IconPhoto size={20} />}
                            onClick={() => galleryInputRef.current?.click()}
                        >
                            Galería
                        </Button>
                        
                        <Button 
                            variant="filled" 
                            color="teal" 
                            leftSection={<IconCamera size={20} />}
                            onClick={() => cameraInputRef.current?.click()}
                        >
                            Cámara
                        </Button>
                    </Group>
                </Box>
            )}

            {compressing && (
                <Center mt="md">
                    <Loader />
                    <Text ml="sm">Optimizando...</Text>
                </Center>
            )}
        </Box>
    );
}