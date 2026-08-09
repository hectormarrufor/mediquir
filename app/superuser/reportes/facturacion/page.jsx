// app/superuser/reportes/facturacion/page.js
import { Box } from '@mantine/core';
import { FacturacionDashboard } from '../../facturacion/componentes/FacturacionDashboard';

export const metadata = {
  title: 'Reporte de Facturación',
  description: 'Visualiza un resumen de las facturas y pagos.',
};

export default function FacturacionReportesPage() {
  return (
    <Box mt={90}>
      <FacturacionDashboard />
    </Box>
  );
}