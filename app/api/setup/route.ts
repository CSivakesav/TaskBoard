import { NextResponse } from 'next/server';
import { initializeWorkbook, hasUsers } from '@/lib/excel/workbook';
import { createUser } from '@/lib/excel/users';
import { z } from 'zod';

const setupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function POST(request: Request) {
  try {
    // Initialize workbook if it doesn't exist
    await initializeWorkbook();

    // Check if users already exist
    const usersExist = await hasUsers();
    if (usersExist) {
      return NextResponse.json(
        { error: 'Setup has already been completed.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = setupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Create the first admin user
    const user = await createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      role: 'ADMIN',
    });

    return NextResponse.json({
      success: true,
      user: { id: user.UserID, name: user.Name, email: user.Email, role: user.Role },
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Setup failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await initializeWorkbook();
    const usersExist = await hasUsers();
    return NextResponse.json({ setupRequired: !usersExist });
  } catch {
    return NextResponse.json({ setupRequired: true });
  }
}
