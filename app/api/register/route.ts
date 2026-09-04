import { NextResponse } from 'next/server';
import { createUser, getUserByEmail } from '@/lib/excel/users';
import { initializeWorkbook } from '@/lib/excel/workbook';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function POST(request: Request) {
  try {
    await initializeWorkbook();

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase().trim();

    // Check if email is already taken
    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in.' },
        { status: 400 }
      );
    }

    // Strict security rule: Any user who registers is ALWAYS given normal user access (MEMBER)
    const user = await createUser({
      name: parsed.data.name.trim(),
      email,
      password: parsed.data.password,
      role: 'MEMBER',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.UserID,
        name: user.Name,
        email: user.Email,
        role: user.Role,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Registration failed' },
      { status: 500 }
    );
  }
}
