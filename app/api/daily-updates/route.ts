import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getDailyUpdates, createDailyUpdate } from '@/lib/excel/updates';
import { logActivity } from '@/lib/excel/activity';
import { z } from 'zod';

const createUpdateSchema = z.object({
  cardId: z.string().min(1),
  updateText: z.string().min(1, 'Update text is required'),
  status: z.string().optional().default(''),
  progress: z.number().min(0).max(100).optional().default(0),
});

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get('cardId');

    if (!cardId) {
      return NextResponse.json({ error: 'cardId is required' }, { status: 400 });
    }

    const updates = await getDailyUpdates(cardId);
    return NextResponse.json(updates);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch updates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const parsed = createUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const update = await createDailyUpdate({
      cardId: parsed.data.cardId,
      userId: user.id,
      updateText: parsed.data.updateText,
      status: parsed.data.status,
      progress: parsed.data.progress,
    });

    await logActivity({
      cardId: parsed.data.cardId,
      userId: user.id,
      action: 'Added daily update',
      newValue: parsed.data.updateText.substring(0, 100),
    });

    return NextResponse.json(update, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create update';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
