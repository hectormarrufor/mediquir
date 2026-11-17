'use client';

import { Flex, Text, UnstyledButton } from '@mantine/core';
import { IconArrowBack } from '@tabler/icons-react';
import { useVolver } from '@/app/helpers/useVolver';

// «Atrás» como en el explorador de Windows: vuelve a la pantalla de donde se vino. `href` solo es el respaldo si no hay historial.
function BackButton({ onClick, href = '/superuser' }) {
  const volver = useVolver(href);
  return (
    <UnstyledButton onClick={onClick || volver}>
      <Flex><IconArrowBack size={25} />
      <Text mx="sm" > Atras</Text></Flex>
    </UnstyledButton>
  );
}

export default BackButton;
