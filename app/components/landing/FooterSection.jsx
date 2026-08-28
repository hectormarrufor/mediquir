'use client';

import { Container, Grid, Title, Text, Stack, Anchor, Divider, Group, Box, Image } from '@mantine/core';
import { IconBrandWhatsapp, IconBrandInstagram, IconMail } from '@tabler/icons-react';

export default function FooterSection() {
    return (
        <Box
            bg="#0B1B3D" 
            c="white"
            py={{ base: 50, md: 80 }}
            style={{
                borderTop: '4px solid #005AAA', 
                fontFamily: '"Montserrat", "Poppins", "Segoe UI", sans-serif',
            }}
        >
            <Container size="xl">
                <Grid gutter="xl" justify="space-between">
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Box mb="lg" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <Image src="/tenants/mediquir/logo.png" alt="Mediquir C.A." w={180} fit="contain" />
                        </Box>
                        <Text size="sm" c="gray.4" mb="xl" maw={320} lh={1.6} fw={400}>
                            Salud y bienestar a tu alcance. Somos líderes en distribución de insumos médicos, garantizando el mejor servicio, rapidez y calidad para ti.
                        </Text>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, sm: 6, md: 2 }}>
                        <Title order={6} mb="lg" c="white" tt="uppercase" lts={1.5} fw={700}>Ventas al Detal</Title>
                        <Stack gap="md">
                            <Anchor href="https://wa.me/584141680773" target="_blank" c="gray.4" size="sm" fw={500} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                                <IconBrandWhatsapp size={18} /> 0414-1680773
                            </Anchor>
                            <Anchor href="https://wa.me/584146501059" target="_blank" c="gray.4" size="sm" fw={500} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                                <IconBrandWhatsapp size={18} /> 0414-6501059
                            </Anchor>
                        </Stack>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                        <Title order={6} mb="lg" c="white" tt="uppercase" lts={1.5} fw={700}>Ventas al Mayor</Title>
                        <Stack gap="md">
                            <Anchor href="https://wa.me/584141680773" target="_blank" c="gray.4" size="sm" fw={500} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                                <IconBrandWhatsapp size={18} /> 0414-1680773
                            </Anchor>
                            <Anchor href="https://wa.me/584149701172" target="_blank" c="gray.4" size="sm" fw={500} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                                <IconBrandWhatsapp size={18} /> 0414-9701172
                            </Anchor>
                        </Stack>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, md: 2 }}>
                        <Title order={6} mb="lg" c="white" tt="uppercase" lts={1.5} fw={700}>Contacto</Title>
                        <Stack gap="md">
                            <Anchor href="mailto:mediquirca@gmail.com" c="gray.4" size="sm" fw={500} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                                <IconMail size={18} /> mediquirca@gmail.com
                            </Anchor>
                            <Anchor href="https://instagram.com/mediquirca" target="_blank" c="gray.4" size="sm" fw={500} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                                <IconBrandInstagram size={18} /> @mediquirca
                            </Anchor>
                        </Stack>
                    </Grid.Col>
                </Grid>

                <Divider my="xl" color="rgba(255,255,255,0.1)" />
                
                <Group justify="space-between" align="center" style={{ flexDirection: 'row' }}>
                    <Text size="sm" c="gray.5" fw={500}>
                        © {new Date().getFullYear()} Mediquir C.A. Todos los derechos reservados.
                    </Text>
                    
                </Group>
            </Container>
        </Box>
    );
}