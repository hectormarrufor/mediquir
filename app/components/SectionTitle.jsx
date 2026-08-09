import { Title } from '@mantine/core';

const sectionColors = {
  motor: '#d32f2f',
  combustible: '#1565c0',
  transmision: '#424242',
  neumaticos: '#2e7d32',
  datosGenerales: 'gray',
  
};

export function SectionTitle({ children, color, section, order = 2 }) {
  const appliedColor = color || (section ? sectionColors[section] : '#333');

  return (
    <Title
      order={order}
      styles={{ root: { color: appliedColor, fontWeight: 700, textTransform: 'uppercase' } }}
    >
      {children}
    </Title>
  );
}