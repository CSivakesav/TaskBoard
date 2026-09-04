import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-helpers';
import { getLists, createList } from '@/lib/excel/lists';
import { z } from 'zod';

const createListSchema = z.object({
  boardId: z.string().min(1, 'Board ID is required'),
  listName: z.string().min(1, 'List name is required'),
});

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId');

    if (!boardId) {
      return NextResponse.json({ error: 'boardId is required' }, { status: 400 });
    }

    const lists = await getLists(boardId);
    return NextResponse.json(lists);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch lists';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = createListSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const list = await createList({
      boardId: parsed.data.boardId,
      listName: parsed.data.listName,
    });

    return NextResponse.json(list, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create list';
    const status = message.includes('Admin') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
