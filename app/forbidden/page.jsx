import { Paper } from "@mantine/core";
import Link from "next/link";

export default function notfound() {
    return (
        <Paper   align="center" mt="40vh">
            <h1>
                Error 403: Usted no posee permisos para navegar por el sistema
            </h1>
            <Link href="/">Volver a la pagina principal</Link>
        </Paper>
    );
}
