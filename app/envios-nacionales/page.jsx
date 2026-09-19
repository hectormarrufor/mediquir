import Link from 'next/link';
import { Anchor, Badge, Box, Button, Container, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowRight, IconBrandWhatsapp, IconClock, IconMail, IconMapPin, IconPhone, IconTruckDelivery } from '@tabler/icons-react';
import { SITIO, absoluta } from '@/app/lib/seo';
import classes from '@/app/components/landing/landing.module.css';

export const metadata = {
    title: 'Envíos a toda Venezuela de materiales médico-quirúrgicos',
    description: 'Mediquir despacha insumos médicos y equipos quirúrgicos desde Ciudad Ojeda (Zulia) a todo el país: Maracaibo, Caracas, Valencia, Barquisimeto y más. Compra por WhatsApp o en la tienda en línea.',
    alternates: { canonical: '/envios-nacionales' },
};

const CIUDADES = ['Maracaibo', 'Cabimas', 'Caracas', 'Valencia', 'Maracay', 'Barquisimeto', 'Mérida', 'San Cristóbal', 'Puerto Ordaz', 'Barcelona', 'Maturín', 'Coro'];

const PASOS = [
    { titulo: 'Elige tus productos', texto: 'Arma tu pedido en la tienda en línea y paga por Pago Móvil, o escríbenos por WhatsApp si compras al mayor.' },
    { titulo: 'Coordinamos el envío', texto: 'Despachamos con la empresa de transporte que prefieras y te avisamos cuando tu pedido esté listo.' },
    { titulo: 'Lo recibes donde estés', texto: 'Llegamos a todo el país: clínicas, farmacias, consultorios y hogares, en cualquier ciudad de Venezuela.' },
];

// Página informativa: responde "¿hacen envíos a mi ciudad?" y refuerza el posicionamiento nacional
export default function EnviosNacionales() {
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage', name: 'Envíos nacionales', url: absoluta('/envios-nacionales'),
        about: { '@type': 'Organization', name: SITIO.nombre, areaServed: { '@type': 'Country', name: 'Venezuela' } },
    };
    const telefono = SITIO.telefono.replace('+58-', '0');

    return (
        <Box style={{ background: '#F4F7FB', minHeight: '100vh' }} pb={{ base: 40, md: 72 }}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

            <Box className={classes.envioHero} py={{ base: 40, md: 72 }}>
                <Container size="lg" px={{ base: 'sm', sm: 'xl' }}>
                    <Text size="sm" c="gray.3" mb="xs" component="nav" aria-label="Ruta"><Link href="/" style={{ color: 'inherit' }}>Inicio</Link> › Envíos nacionales</Text>
                    <Badge variant="outline" color="white" size="lg" radius="xl" tt="none" leftSection={<IconTruckDelivery size={14} />} mb="sm" style={{ borderWidth: 1.5 }}>Cobertura nacional</Badge>
                    <Title order={1} c="white" fz={{ base: 32, sm: 44, md: 54 }} fw={900} lh={1.1} tt="none" display="block" pb={0} styles={{ root: { color: 'white' } }} style={{ letterSpacing: '-0.5px' }}>
                        Envíos a toda <Text component="span" c="sky.3" inherit>Venezuela</Text>
                    </Title>
                    <Text c="gray.3" fz={{ base: 'md', md: 'lg' }} mt="sm" maw={680} lh={1.6}>
                        {SITIO.nombre} es una distribuidora de materiales y equipos médico-quirúrgicos en {SITIO.ciudad}, estado {SITIO.estado}. Sin importar en qué ciudad estés, te hacemos llegar tu pedido.
                    </Text>
                    <Group gap="sm" mt="lg">
                        <Button component={Link} href="/#productos-section" size="md" radius="xl" color="accent.6" rightSection={<IconArrowRight size={16} />} tt="none">Ir a la tienda</Button>
                        <Button component="a" href={`https://wa.me/${SITIO.whatsapp}`} target="_blank" rel="noopener noreferrer" size="md" radius="xl" variant="white" color="navy.9" leftSection={<IconBrandWhatsapp size={18} />} tt="none">Escribir por WhatsApp</Button>
                    </Group>
                </Container>
            </Box>

            <Container size="lg" px={{ base: 'sm', sm: 'xl' }} mt={{ base: 28, md: 44 }}>
                <Title order={2} c="navy.9" fz={{ base: 22, md: 28 }} fw={900} tt="none" display="block" pb={0} mb="md">Cómo funciona</Title>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mb={{ base: 28, md: 44 }}>
                    {PASOS.map((p, i) => (
                        <Paper key={p.titulo} className={classes.seoTarjeta} style={{ padding: 20 }}>
                            <Group gap="sm" wrap="nowrap" mb="xs">
                                <span className={classes.paso}>{i + 1}</span>
                                <Title order={4} c="navy.9" fz={17} fw={800} tt="none" display="block" pb={0}>{p.titulo}</Title>
                            </Group>
                            <Text size="sm" c="dimmed" lh={1.6}>{p.texto}</Text>
                        </Paper>
                    ))}
                </SimpleGrid>

                <Paper className={classes.seoTarjeta} style={{ padding: 22 }} mb={{ base: 28, md: 44 }}>
                    <Title order={3} c="navy.9" fz={{ base: 19, md: 22 }} fw={800} tt="none" display="block" pb={0} mb="xs">Llegamos a todo el país</Title>
                    <Text size="sm" c="dimmed" mb="sm">Despachamos a Maracaibo, Cabimas, Caracas, Valencia y cualquier otra ciudad de Venezuela, entre ellas:</Text>
                    <Group gap={8}>
                        {CIUDADES.map((c) => <Badge key={c} variant="light" color="brand" size="lg" radius="xl" tt="none">{c}</Badge>)}
                        <Badge variant="filled" color="accent.6" size="lg" radius="xl" tt="none">¡y más!</Badge>
                    </Group>
                </Paper>

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <Paper className={classes.seoTarjeta} style={{ padding: 22 }}>
                        <Group gap="sm" mb="sm" wrap="nowrap">
                            <ThemeIcon size={44} radius="md" variant="light" color="accent"><IconClock size={24} /></ThemeIcon>
                            <Title order={3} c="navy.9" fz={20} fw={800} tt="none" display="block" pb={0}>Horario de despacho</Title>
                        </Group>
                        <Stack gap={6}>
                            <Group justify="space-between"><Text size="sm" fw={600}>Lunes a viernes</Text><Text size="sm" c="dimmed">hasta las 4:30 p. m.</Text></Group>
                            <Group justify="space-between"><Text size="sm" fw={600}>Sábados</Text><Text size="sm" c="dimmed">hasta las 12:30 p. m.</Text></Group>
                            <Text size="xs" c="dimmed" mt={4}>Hora de Venezuela. Los pedidos hechos fuera de este horario salen el siguiente día hábil.</Text>
                        </Stack>
                    </Paper>

                    <Paper className={classes.seoTarjeta} style={{ padding: 22 }}>
                        <Group gap="sm" mb="sm" wrap="nowrap">
                            <ThemeIcon size={44} radius="md" variant="light" color="brand"><IconMapPin size={24} /></ThemeIcon>
                            <Title order={3} c="navy.9" fz={20} fw={800} tt="none" display="block" pb={0}>¿Dónde estamos?</Title>
                        </Group>
                        <Stack gap={8}>
                            <Text size="sm" lh={1.5}>{SITIO.direccion}</Text>
                            <Group gap={6} wrap="nowrap"><IconPhone size={16} color="var(--mantine-color-brand-6)" /><Anchor href={`tel:${SITIO.telefono}`} size="sm" c="navy.9">{telefono}</Anchor></Group>
                            <Group gap={6} wrap="nowrap"><IconMail size={16} color="var(--mantine-color-brand-6)" /><Anchor href={`mailto:${SITIO.email}`} size="sm" c="navy.9">{SITIO.email}</Anchor></Group>
                        </Stack>
                    </Paper>
                </SimpleGrid>
            </Container>
        </Box>
    );
}
