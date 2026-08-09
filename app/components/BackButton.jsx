import { Flex, Text, UnstyledButton } from '@mantine/core';
import { IconArrowBack } from '@tabler/icons-react'; // Importa el icono de edición

function BackButton({ onClick }) {
  return (
    <UnstyledButton
       // Agrega el icono de edición
      onClick={onClick} // Agrega la función onClick
    >
      <Flex><IconArrowBack size={25} />
      <Text mx="sm" > Atras</Text></Flex>
    </UnstyledButton>
  );
}

export default BackButton;