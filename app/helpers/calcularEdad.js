    const calcularEdad = (fecha) => {
        if (!fecha) return null
        const nacimiento = new Date(fecha)
        if (Number.isNaN(nacimiento.getTime())) return null
        const hoy = new Date()
        let edad = hoy.getFullYear() - nacimiento.getFullYear()
        const mes = hoy.getMonth() - nacimiento.getMonth()
        if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--
        return edad
    }

    export default calcularEdad