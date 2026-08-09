import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { jwtVerify } from "jose";
import db from "@/models"; // Tu instancia de Sequelize

export async function GET(req) {
  try {
    // 1. Obtenemos el token de la cookie
    const token = (await req.cookies.get('token'))?.value;
    if (!token) return NextResponse.json({ active: false }, { status: 401 });

    // 2. Verificamos firma (igual que el middleware)
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // 3. CONSULTA REAL A LA BD: ¿Existe y está activo este usuario?
    const usuario = await db.User.findByPk(payload.id, {
      attributes: ['id', 'estado'] // Solo traemos lo necesario
    });

    // Si no existe (fue borrado) o está inactivo
    if (!usuario || usuario.estado === 'Inactivo') {
      // Opcional: Borrar suscripciones push huérfanas aquí mismo
      await db.PushSubscription.destroy({ where: { userId: payload.id } });
      
      return NextResponse.json({ active: false }, { status: 401 });
    }

    return NextResponse.json({ active: true });

  } catch (error) {
    return NextResponse.json({ active: false }, { status: 401 });
  }
}