// app/superuser/reportes/compras/page.js
import { Title, Box } from '@mantine/core';
import { ReporteCompras } from './ReporteCompras';

export const metadata = {
  title: 'Reporte de Compras',
  description: 'Análisis de órdenes de compra, recepciones y facturas de proveedor.',
};

export default function ReporteComprasPage() {
  return (
    <Box>
      <ReporteCompras />
    </Box>
  );
}