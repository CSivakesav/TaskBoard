'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import styles from './dashboard.module.css';
import {
  LayoutDashboard, CheckCircle2, Clock, AlertTriangle, ListTodo,
  TrendingUp, LogOut, Plus, ChevronRight, User, Calendar, MessageSquare,
  Moon, Sun, Kanban
} from 'lucide-react';
import type { DashboardStats, Board } from '@/lib/types';

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const user = session?.user as { id: string; name: string; email: string; role: string } | undefined;
  const isAdmin = user?.role === 'ADMIN';

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, boardsRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/boards'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (boardsRes.ok) setBoards(await boardsRes.json());
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [darkMode]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="spinner spinner-lg" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <nav className={styles.navbar}>
        <div className={styles.navLeft}>
          <div className={styles.logo}>
            <LayoutDashboard size={22} />
            <span>TaskBoard</span>
          </div>
        </div>
        <div className={styles.navRight}>
          <button className={styles.themeToggle} onClick={() => setDarkMode(!darkMode)} title="Toggle theme">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{user?.name}</span>
              <span className={styles.userRole}>{user?.role}</span>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: '/login' })} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.greeting}>Welcome back, {user?.name?.split(' ')[0]}</h1>
            <p className={styles.headerSub}>Here&apos;s an overview of your projects</p>
          </div>
          {isAdmin && (
            <button className={styles.newBoardBtn} onClick={() => router.push('/boards')}>
              <Plus size={18} /> <span>New Board</span>
            </button>
          )}
        </div>

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statTotal}`}>
            <div className={styles.statIcon}><ListTodo size={22} /></div>
            <div className={styles.statInfo}>
              <span className={styles.statNumber}>{stats?.totalTasks || 0}</span>
              <span className={styles.statLabel}>Total Tasks</span>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statCompleted}`}>
            <div className={styles.statIcon}><CheckCircle2 size={22} /></div>
            <div className={styles.statInfo}>
              <span className={styles.statNumber}>{stats?.completed || 0}</span>
              <span className={styles.statLabel}>Completed</span>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statProgress}`}>
            <div className={styles.statIcon}><Clock size={22} /></div>
            <div className={styles.statInfo}>
              <span className={styles.statNumber}>{stats?.inProgress || 0}</span>
              <span className={styles.statLabel}>In Progress</span>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statOverdue}`}>
            <div className={styles.statIcon}><AlertTriangle size={22} /></div>
            <div className={styles.statInfo}>
              <span className={styles.statNumber}>{stats?.overdue || 0}</span>
              <span className={styles.statLabel}>Overdue</span>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statPercent}`}>
            <div className={styles.statIcon}><TrendingUp size={22} /></div>
            <div className={styles.statInfo}>
              <span className={styles.statNumber}>{stats?.completionPercentage || 0}%</span>
              <span className={styles.statLabel}>Completion</span>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statUpdates}`}>
            <div className={styles.statIcon}><MessageSquare size={22} /></div>
            <div className={styles.statInfo}>
              <span className={styles.statNumber}>{stats?.todaysUpdates || 0}</span>
              <span className={styles.statLabel}>Today&apos;s Updates</span>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className={styles.contentGrid}>
          {/* Boards */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2><Kanban size={18} /> Your Boards</h2>
              <button className={styles.viewAllBtn} onClick={() => router.push('/boards')}>
                View all <ChevronRight size={16} />
              </button>
            </div>
            <div className={styles.boardsList}>
              {boards.length === 0 ? (
                <div className={styles.emptyState}>
                  <Kanban size={32} />
                  <p>No boards yet{isAdmin ? '. Create one!' : ''}</p>
                </div>
              ) : (
                boards.slice(0, 4).map((board) => (
                  <div
                    key={board.BoardID}
                    className={styles.boardCard}
                    onClick={() => router.push(`/boards/${board.BoardID}`)}
                  >
                    <div className={styles.boardCardGradient} />
                    <h3>{board.BoardName}</h3>
                    <p>{board.Description || 'No description'}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Updates */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2><MessageSquare size={18} /> Recent Updates</h2>
            </div>
            <div className={styles.updatesList}>
              {(!stats?.recentUpdates || stats.recentUpdates.length === 0) ? (
                <div className={styles.emptyState}>
                  <MessageSquare size={32} />
                  <p>No updates yet</p>
                </div>
              ) : (
                stats.recentUpdates.slice(0, 6).map((update) => (
                  <div key={update.UpdateID} className={styles.updateItem}>
                    <div className={styles.updateAvatar}>
                      {update.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.updateContent}>
                      <div className={styles.updateMeta}>
                        <span className={styles.updateUser}>{update.userName}</span>
                        <span className={styles.updateDate}>
                          {new Date(update.CreatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className={styles.updateText}>{update.UpdateText}</p>
                      <span className={styles.updateCard}>{update.cardTitle}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tasks by Member */}
          {stats?.tasksByMember && stats.tasksByMember.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2><User size={18} /> Tasks by Member</h2>
              </div>
              <div className={styles.membersList}>
                {stats.tasksByMember.map((member) => (
                  <div key={member.email} className={styles.memberItem}>
                    <div className={styles.memberAvatar}>
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.memberInfo}>
                      <span className={styles.memberName}>{member.name}</span>
                      <div className={styles.memberBar}>
                        <div
                          className={styles.memberBarFill}
                          style={{
                            width: `${Math.min(
                              100,
                              stats.totalTasks > 0
                                ? (member.count / stats.totalTasks) * 100
                                : 0
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className={styles.memberCount}>{member.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overdue Tasks */}
          {stats?.overdueTasks && stats.overdueTasks.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2><AlertTriangle size={18} /> Overdue Tasks</h2>
              </div>
              <div className={styles.overdueList}>
                {stats.overdueTasks.map((task) => (
                  <div key={task.CardID} className={styles.overdueItem}>
                    <div className={styles.overdueInfo}>
                      <span className={styles.overdueTitle}>{task.Title}</span>
                      <span className={styles.overdueDate}>
                        <Calendar size={12} /> Due: {new Date(task.DueDate).toLocaleDateString()}
                      </span>
                    </div>
                    <span className={`priority-badge-${task.Priority.toLowerCase()}`} style={{
                      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600
                    }}>
                      {task.Priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
