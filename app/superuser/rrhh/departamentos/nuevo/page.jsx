// app/superuser/rrhh/departamentos/nuevo/page.jsx
import DepartamentoForm from '../components/DepartamentoForm';
import {SectionTitle} from '../../../../components/SectionTitle';

export default function NuevoDepartamentoPage() {
    return (
        <div>
            <SectionTitle title="Crear Nuevo Departamento" />
            <DepartamentoForm />
        </div>
    );
}