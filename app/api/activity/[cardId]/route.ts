import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getActivities } from '@/lib/excel/activity';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    await requireAuth();
    const { cardId } = await params;
    const activities = await getActivities(cardId);
    return NextResponse.json(activities);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch activity';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
