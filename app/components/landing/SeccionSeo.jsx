import Link from 'next/link';
import { Badge, Box, Button, Container, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowRight, IconBrandWhatsapp, IconBuildingStore, IconMapPin, IconTruckDelivery } from '@tabler/icons-react';
import { Categoria, Producto } from '@/models';
import CategoryIcon from '@/app/components/CategoryIcon';
import { SITIO, rutaCategoria } from '@/app/lib/seo';
import classes from './landing.module.css';

const VENTAJAS = [
    { icono: IconBuildingStore, color: 'brand', titulo: 'Al mayor y al detal', texto: 'Clínicas, hospitales, farmacias, consultorios y particulares: compra por unidad, por caja o por bulto.' },
    { icono: IconTruckDelivery, color: 'accent', titulo: 'Envíos a toda Venezuela', texto: 'Despachamos desde Ciudad Ojeda a todo el país, con la empresa de transporte que prefieras.' },
    { icono: IconBrandWhatsapp, color: 'teal', titulo: 'Atención por WhatsApp', texto: 'Te asesoramos, cotizamos y coordinamos tu pedido de forma rápida y directa.' },
    { icono: IconMapPin, color: 'navy', titulo: 'Ciudad Ojeda, Zulia', texto: 'Casco Central, Calle Venezuela entre Av. Bolívar y Av. Alonso. Ven a conocernos.' },
];

// Texto de la portada para buscadores y para las personas: quiénes somos, a dónde enviamos y las categorías.
// Se arma en el servidor, así Google lo lee completo sin ejecutar JavaScript.
export default async function SeccionSeo() {
    let categorias = [];
    try {
        const filas = await Categoria.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']] });
        categorias = await Promise.all(filas.map(async (c) => ({ id: c.id, nombre: c.nombre, total: await Producto.count({ where: { categoriaId: c.id } }) })));
    } catch (e) {
        console.error('SeccionSeo:', e.message);
    }

    return (
        <Box component="section" aria-labelledby="quienes-somos" py={{ base: 36, md: 64 }} style={{ background: 'linear-gradient(180deg, #F4F7FB 0%, #EAF0F7 100%)' }}>
            <Container fluid px={{ base: 'sm', sm: 'xl' }}>
                <Stack gap="xs" align="center" ta="center" mb={{ base: 'lg', md: 36 }}>
                    <Badge variant="light" color="brand" size="lg" radius="xl" tt="none">Distribuidora médica · Ciudad Ojeda, Zulia</Badge>
                    <Title id="quienes-somos" order={2} c="navy.9" fz={{ base: 26, sm: 34, md: 40 }} fw={900} lh={1.15} tt="none" display="block" pb={0} maw={820}>
                        Materiales y equipos médico-quirúrgicos{' '}
                        <Text component="span" c="brand.6" inherit>para toda Venezuela</Text>
                    </Title>
                    <Text c="dimmed" fz={{ base: 'sm', md: 'md' }} maw={760} lh={1.6}>
                        {SITIO.nombre} distribuye insumos médicos y equipos quirúrgicos: jeringas, agujas, guantes, mascarillas, catéteres, gasas, drenajes,
                        circuitos de anestesia y mucho más. Compra en la tienda en línea, escríbenos por WhatsApp o visítanos en {SITIO.ciudad}, estado {SITIO.estado}.
                    </Text>
                </Stack>

                <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing={{ base: 'sm', md: 'md' }} mb={{ base: 28, md: 44 }}>
                    {VENTAJAS.map((v) => (
                        <Paper key={v.titulo} className={classes.seoTarjeta} style={{ padding: 18 }}>
                            <ThemeIcon size={46} radius="md" variant="light" color={v.color} mb="sm"><v.icono size={26} stroke={1.6} /></ThemeIcon>
                            <Title order={4} c="navy.9" fz={17} fw={800} tt="none" display="block" pb={0} mb={4}>{v.titulo}</Title>
                            <Text size="sm" c="dimmed" lh={1.55}>{v.texto}</Text>
                        </Paper>
                    ))}
                </SimpleGrid>

                {categorias.length > 0 && (
                    <>
                        <Title order={3} c="navy.9" fz={{ base: 20, md: 24 }} fw={800} tt="none" display="block" pb={0} mb="sm">Explora por categoría</Title>
                        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing={{ base: 'xs', md: 'md' }} mb={{ base: 28, md: 44 }}>
                            {categorias.map((c) => (
                                <Link key={c.id} href={rutaCategoria(c)} className={classes.seoTarjeta}>
                                    <Group gap="sm" wrap="nowrap" align="center">
                                        <CategoryIcon categoryName={c.nombre} size={42} color="brand" />
                                        <Box style={{ minWidth: 0 }}>
                                            <Text fw={800} size="sm" c="navy.9" lh={1.2} lineClamp={2}>{c.nombre}</Text>
                                            <Text size="xs" c="dimmed">{c.total} productos</Text>
                                        </Box>
                                    </Group>
                                </Link>
                            ))}
                        </SimpleGrid>
                    </>
                )}

                <Paper className={classes.seoBanda} p={{ base: 'lg', md: 'xl' }}>
                    <Group justify="space-between" align="center" gap="lg" wrap="wrap">
                        <Box maw={620}>
                            <Title order={3} c="white" fz={{ base: 20, md: 26 }} fw={900} tt="none" display="block" pb={0} styles={{ root: { color: 'white' } }}>¿Buscas algo en especial o necesitas cotizar al mayor?</Title>
                            <Text c="gray.3" size="sm" mt={4}>Escríbenos y te respondemos con disponibilidad, precios y tiempos de envío.</Text>
                        </Box>
                        <Group gap="sm">
                            <Button component="a" href={`https://wa.me/${SITIO.whatsapp}`} target="_blank" rel="noopener noreferrer" color="green" size="md" radius="xl" leftSection={<IconBrandWhatsapp size={18} />} tt="none">
                                Escribir por WhatsApp
                            </Button>
                            <Button component={Link} href="/envios-nacionales" variant="white" color="navy.9" size="md" radius="xl" rightSection={<IconArrowRight size={16} />} tt="none">
                                Envíos nacionales
                            </Button>
                        </Group>
                    </Group>
                </Paper>
            </Container>
        </Box>
    );
}
