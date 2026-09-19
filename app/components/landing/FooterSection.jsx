'use client';

import { Container, Grid, Title, Text, Stack, Anchor, Divider, Group, Box, Image } from '@mantine/core';
import { IconBrandWhatsapp, IconBrandInstagram, IconMail } from '@tabler/icons-react';
import classes from './landing.module.css';

const linkStyle = { display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' };

function ContactLink({ href, icon: Icon, children }) {
    return (
        <Anchor href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" c="gray.4" size="sm" fw={500} style={linkStyle}>
            <Icon size={18} /> {children}
        </Anchor>
    );
}

function Column({ title, children, span }) {
    return (
        <Grid.Col span={span}>
            <Title order={6} mb="sm" c="white" tt="uppercase" lts={1.5} fw={700} styles={{ root: { color: 'white', paddingBottom: 0, display: 'block' } }}>
                {title}
            </Title>
            <Stack gap="sm">{children}</Stack>
        </Grid.Col>
    );
}

export default function FooterSection() {
    return (
        <Box id="contacto" className={classes.footer} c="white" py={{ base: 32, md: 64 }}>
            <Container size="xl" px={{ base: 'sm', sm: 'md' }}>
                <Grid gutter={{ base: 'lg', md: 'xl' }} justify="space-between">
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Image
                            src="/tenants/mediquir/logo-header@2x.png" alt="Mediquir C.A."
                            w={{ base: 140, md: 180 }} fit="contain" mb="sm"
                        />
                        <Text size="sm" c="gray.4" maw={340} lh={1.6}>
                            Salud y bienestar a tu alcance. Distribución de insumos médicos con servicio, rapidez y calidad.
                        </Text>
                    </Grid.Col>

                    <Column title="Ventas al detal" span={{ base: 6, md: 2 }}>
                        <ContactLink href="https://wa.me/584141680773" icon={IconBrandWhatsapp}>0414-1680773</ContactLink>
                        <ContactLink href="https://wa.me/584146501059" icon={IconBrandWhatsapp}>0414-6501059</ContactLink>
                    </Column>

                    <Column title="Ventas al mayor" span={{ base: 6, md: 3 }}>
                        <ContactLink href="https://wa.me/584141680773" icon={IconBrandWhatsapp}>0414-1680773</ContactLink>
                        <ContactLink href="https://wa.me/584149701172" icon={IconBrandWhatsapp}>0414-9701172</ContactLink>
                    </Column>

                    <Column title="Contacto" span={{ base: 12, md: 3 }}>
                        <ContactLink href="mailto:mediquirca@gmail.com" icon={IconMail}>mediquirca@gmail.com</ContactLink>
                        <ContactLink href="https://instagram.com/mediquirca" icon={IconBrandInstagram}>@mediquirca</ContactLink>
                    </Column>
                </Grid>

                <Divider my="lg" color="rgba(255,255,255,0.1)" />

                <Group justify="space-between" align="center">
                    <Text size="xs" c="gray.5" fw={500}>
                        © {new Date().getFullYear()} Mediquir C.A. Todos los derechos reservados.
                    </Text>
                </Group>
            </Container>
        </Box>
    );
}
