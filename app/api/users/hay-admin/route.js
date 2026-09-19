import { NextResponse } from 'next/server';
import { User } from '@/models';

// Público: el login solo necesita saber SI existe un administrador (para ofrecer el registro inicial). No devuelve datos de nadie.
export async function GET() {
    const total = await User.count({ where: { isAdmin: true } });
    return NextResponse.json({ hayAdmin: total > 0 });
}
