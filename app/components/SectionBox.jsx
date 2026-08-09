import { Paper, Stack, SimpleGrid } from '@mantine/core';
import { SectionTitle } from './SectionTitle';

export function SectionBox({ section, title, children, cols = 1, flex=1 }) {
  return (
    <Paper shadow="sm" radius="md" p="md"  bg="gray.0" flex={flex}>
      <SectionTitle section={section}>{title}</SectionTitle>

      <SimpleGrid cols={cols} spacing="xs" verticalSpacing="xs" mt="sm">
        {children}
      </SimpleGrid>
    </Paper>
  );
}
