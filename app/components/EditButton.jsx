import { UnstyledButton } from '@mantine/core';
import { IconEdit } from '@tabler/icons-react'; // Importa el icono de edición

function EditButton({ onClick }) {
  return (
    <UnstyledButton
       // Agrega el icono de edición
      onClick={onClick} // Agrega la función onClick
    >
      <IconEdit size={18} />
    </UnstyledButton>
  );
}

export default EditButton;