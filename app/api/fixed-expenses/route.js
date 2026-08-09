import { FixedExpense } from '@/models';
import { NextResponse } from 'next/server';

// GET: listar gastos activos
export async function GET() {
  const gastos = await FixedExpense.findAll({ where: { activo: true } });
  return NextResponse.json(gastos);
}

// POST: crear nuevo gasto
export async function POST(req) {
  const body = await req.json();
  const nuevo = await FixedExpense.create(body);
  return NextResponse.json(nuevo);
}

// PUT: actualizar gasto existente
export async function PUT(req) {
  const body = await req.json();
  const gasto = await FixedExpense.findByPk(body.id);
  if (!gasto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  await gasto.update(body);
  return NextResponse.json(gasto);
}

// DELETE: desactivar gasto
export async function DELETE(req) {
  const body = await req.json();
  const gasto = await FixedExpense.findByPk(body.id);
  if (!gasto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  await gasto.update({ activo: false });
  return NextResponse.json({ success: true });
}