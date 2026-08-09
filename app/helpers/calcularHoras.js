 function calcularHoras(startStr, endStr) {
        if (!startStr || !endStr) return 0;
        const [sh, sm] = startStr.split(":").map(Number);
        const [eh, em] = endStr.split(":").map(Number);
        let start = sh * 60 + sm;
        let end = eh * 60 + em;
        // si end < start asumimos que cruza la medianoche y sumamos 24h
        if (end < start) end += 24 * 60;
        const diffMinutes = end - start;
        return Math.round((diffMinutes / 60) * 100) / 100;
    }

    export default calcularHoras;