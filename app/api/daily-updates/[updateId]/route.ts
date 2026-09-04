import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { updateDailyUpdate } from '@/lib/excel/updates';
import { z } from 'zod';

const updateSchema = z.object({
  updateText: z.string().min(1).optional(),
  status: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ updateId: string }> }
) {
  try {
    const user = await requireAuth();
    const { updateId } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await updateDailyUpdate(updateId, user.id, parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update';
    const status = message.includes('only edit your own') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
