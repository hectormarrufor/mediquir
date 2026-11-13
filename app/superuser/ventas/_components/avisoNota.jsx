'use client';

import React from 'react';
import { Button, Group } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

// Aviso de una nota de crédito o de débito recién emitida, con el botón para imprimirla de una vez (una por nota).
// Va en un aviso con botón (y no se abre sola) porque el navegador bloquea las ventanas que no vienen de un toque.
// `notas`: [{ id, numero }]
export function avisarNotaEmitida({ titulo, mensaje, notas, color = 'teal', autoClose = 20000 }) {
    const id = `nota-${notas.map((n) => n.id).join('-')}`;
    notifications.show({
        id, color, autoClose, withCloseButton: true, title: titulo,
        message: (
            <>
                {mensaje}
                <Group gap="xs" mt={6}>
                    {notas.filter((n) => n.id).map((n) => (
                        <Button key={n.id} size="xs" color="blue.8" leftSection={<IconPrinter size={14} />}
                            onClick={() => { window.open(`/superuser/notas/${n.id}/imprimir`, '_blank'); notifications.hide(id); }}>
                            Imprimir {notas.length > 1 ? n.numero : 'ahora'}
                        </Button>
                    ))}
                </Group>
            </>
        ),
    });
}
