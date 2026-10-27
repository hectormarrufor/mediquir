import { Button, Card, Center, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";

export default function NotFound() {
    return (
        <Center mih="70vh" px="md">
            <Card radius="lg" p="xl" maw={460} w="100%" withBorder>
                <Stack align="center" gap="sm" ta="center">
                    <Text fw={800} c="dimmed" fz={13} tt="uppercase" lts={2}>Error 404</Text>
                    <Title order={2} c="navy.9">Esta página no existe</Title>
                    <Text c="dimmed">Puede que el enlace esté incompleto o que el producto ya no esté disponible.</Text>
                    <Button component={Link} href="/" mt="sm" color="navy.9" radius="xl">Volver a la tienda</Button>
                </Stack>
            </Card>
        </Center>
    );
}
