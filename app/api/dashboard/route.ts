import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getAllCards } from '@/lib/excel/cards';
import { getRecentUpdates, getTodaysUpdatesCount } from '@/lib/excel/updates';
import { getActiveUsers } from '@/lib/excel/users';
import { getCardById } from '@/lib/excel/cards';
import { getUserById } from '@/lib/excel/users';
import { getAllLists } from '@/lib/excel/lists';
import type { DashboardStats } from '@/lib/types';

export async function GET() {
  try {
    await requireAuth();

    const [cards, users, recentUpdatesRaw, todaysUpdates, lists] = await Promise.all([
      getAllCards(),
      getActiveUsers(),
      getRecentUpdates(10),
      getTodaysUpdatesCount(),
      getAllLists(),
    ]);

    const now = new Date();
    const completed = cards.filter((c) => c.Status === 'COMPLETED').length;
    const inProgress = cards.filter((c) => c.Status === 'IN PROGRESS').length;
    const pending = cards.filter((c) => c.Status === 'TODO').length;
    const overdue = cards.filter((c) => {
      if (!c.DueDate || c.Status === 'COMPLETED') return false;
      return new Date(c.DueDate) < now;
    }).length;

    // Tasks by member
    const tasksByMember = users.map((u) => ({
      name: u.Name,
      email: u.Email,
      count: cards.filter((c) => c.AssignedTo === u.Email || c.AssignedTo === u.UserID).length,
    })).filter((m) => m.count > 0);

    // Enrich recent updates with card titles and user names
    const recentUpdates = await Promise.all(
      recentUpdatesRaw.map(async (update) => {
        const card = await getCardById(update.CardID);
        const user = await getUserById(update.UserID);
        return {
          ...update,
          cardTitle: card?.Title || 'Unknown Card',
          userName: user?.Name || 'Unknown User',
        };
      })
    );

    // Overdue tasks with list names
    const overdueCards = cards
      .filter((c) => {
        if (!c.DueDate || c.Status === 'COMPLETED') return false;
        return new Date(c.DueDate) < now;
      })
      .map((c) => {
        const list = lists.find((l) => l.ListID === c.ListID);
        return { ...c, listName: list?.ListName || 'Unknown' };
      });

    const stats: DashboardStats = {
      totalTasks: cards.length,
      completed,
      inProgress,
      pending,
      overdue,
      todaysUpdates,
      tasksByMember,
      completionPercentage: cards.length > 0 ? Math.round((completed / cards.length) * 100) : 0,
      recentUpdates,
      overdueTasks: overdueCards,
    };

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch dashboard';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
