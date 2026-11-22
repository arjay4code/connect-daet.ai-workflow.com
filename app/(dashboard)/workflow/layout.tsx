'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  getOfficeFileManagementPath,
  getOfficeNotificationsPath,
  getRoleHomePath,
  isOfficeRole,
} from '@/lib/workflow/offices';
import { WorkflowRoleProvider } from '@/lib/workflow/role-context';
import { useWorkflowActivityPresence } from '@/lib/workflow/useWorkflowActivityPresence';

export default function WorkflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [role, setRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [authSession, setAuthSession] = useState<Session | null | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false); 
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const accountRequestRef = useRef<Promise<{
    session: Session | null;
    profile: { role: string; full_name: string | null } | null;
    profileError: { message: string } | null;
  }> | null>(null);
  const endActivitySession = useWorkflowActivityPresence(supabase, authSession);

  const refreshHasUnread = useCallback(async () => {
    const { data, error } = await supabase.rpc('has_unread_workflow_notifications');
    if (error) {
      console.error('Could not check unread notifications:', error.message);
      return;
    }
    setHasUnread(data === true);
  }, [supabase]);

  // 1. Initial User & Role Fetch
  useEffect(() => {
    let active = true;
    if (!accountRequestRef.current) {
      accountRequestRef.current = (async () => {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) return { session: null, profile: null, profileError: null };

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', session.user.id)
          .single();

        return { session, profile, profileError };
      })();
    }

    void accountRequestRef.current.then(({ session, profile, profileError }) => {
      if (!active) return;
      setAccountReady(true);
      setAuthSession(session);
      setUserId(session?.user.id ?? null);
      setUserEmail(session?.user.email || null);
      setUserFullName(profile?.full_name ?? null);
      if (profileError) {
        console.error('Could not load the signed-in workflow profile:', profileError.message);
      }
      setRole(session ? (profileError ? null : profile?.role || 'submitter') : null);
      if (session && !profileError) {
        void refreshHasUnread();
      }
    }).catch((error: unknown) => {
      if (!active) return;
      console.error(
        'Could not load the signed-in workflow account:',
        error instanceof Error ? error.message : error,
      );
      setUserId(null);
      setUserEmail(null);
      setUserFullName(null);
      setRole(null);
      setAuthSession(null);
      setAccountReady(true);
    });

    return () => {
      active = false;
    };
  }, [refreshHasUnread, supabase]);

  // 2. Realtime Subscription Effect (Fixed to prevent "subscribe()" errors)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`sidebar-notifs-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workflow_notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => void refreshHasUnread()
      )
      .subscribe();

    const handleNotificationChange = () => void refreshHasUnread();
    window.addEventListener('workflow-notifications-changed', handleNotificationChange);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('workflow-notifications-changed', handleNotificationChange);
    };
  }, [supabase, userId, refreshHasUnread]);

  const handleLogout = async () => {
    await endActivitySession();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const navLinks = () => {
    if (role === 'submitter') {
      return [
        { href: '/workflow/user', label: 'Dashboard', icon: '◰' },
        { href: '/workflow/user/upload', label: 'Upload', icon: '⊕' },
        { href: '/workflow/user/file_registry', label: 'File Registry', icon: '▤' },
        { href: '/workflow/user/notifications', label: 'Notifications', icon: '⌁', alert: hasUnread && !pathname.includes('notifications') },
      ];
    }
    if (isOfficeRole(role)) {
      return [
        { href: getRoleHomePath(role), label: 'Dashboard', icon: '▤' },
        { href: getOfficeFileManagementPath(role), label: 'File Registry', icon: '▤' },
        { href: getOfficeNotificationsPath(role), label: 'Notifications', icon: '⌁', alert: hasUnread && !pathname.includes('notifications') },
        { href: '/workflow/retrieval', label: 'Scan QR Code', icon: '⌗' },
      ];
    }
    if (role === 'system_admin') {
      return [
        { href: '/workflow/admin', label: 'Dashboard', icon: '⌬' },
        { href: '/workflow/admin/user_management', label: 'User Registry', icon: '☍' },
        { href: '/workflow/admin/database-backup', label: 'Backup & Restore', icon: '⇄' },
        { href: '/workflow/admin/system-logs', label: 'System Logs', icon: '◷' },
        { href: '/workflow/admin/submissions', label: 'File Submissions', icon: '▤' },
        { href: '/workflow/admin/reports', label: 'Reports', icon: '▥' },
        { href: '/workflow/admin/notifications', label: 'Notifications', icon: '⌁', alert: hasUnread },
      ];
    }
    return [];
  };

  const isActive = (path: string) => pathname === path;

  return (
    <WorkflowRoleProvider
      role={role}
      userId={userId}
      fullName={userFullName}
      ready={accountReady}
    >
    <div className="workflow-system min-h-screen bg-cream text-warm-text">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        className={`fixed left-4 top-3 z-50 ${sidebarOpen ? 'hidden' : 'flex'} h-10 w-10 items-center justify-center rounded-lg bg-card text-warm-text shadow-sm lg:hidden max-md:left-2.5 max-md:top-2.5 max-md:h-11 max-md:w-11`}
      >
        <svg className="md:hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="hidden md:block">{sidebarOpen ? '×' : '☰'}</span>
      </button>

      <aside className={`
        fixed top-0 left-0 z-40 h-full w-59.5 border-r border-warm-border bg-sidebar
        transition-transform duration-300 lg:translate-x-0
        flex flex-col max-lg:w-[min(80vw,18rem)] max-lg:overflow-y-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex h-16 items-center gap-3 border-b border-warm-border px-7">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-clay text-lg text-white">▤</span>
          <h1 className="max-w-[8rem] text-[9px] font-bold leading-[11px] tracking-[0.05em] text-warm-text">
            Connect-Date.ai
          </h1>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-white/70 hover:text-warm-text lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-8">
          <div className="mb-4 px-3 text-[11px] font-medium text-muted-text">Workspace</div>
          {navLinks().map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center justify-between rounded-lg px-3 py-3 text-sm transition-colors ${active ? 'bg-clay-soft text-clay' : 'text-warm-text hover:bg-white/70'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-4 text-center text-lg leading-none" aria-hidden="true">{link.icon}</span>
                  <span className="font-medium">{link.label === 'Upload' ? 'New Submission' : link.label === 'File Registry' ? 'My Files' : link.label}</span>
                </div>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-clay" />}
                {link.alert && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clay opacity-50"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-clay"></span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mx-5 mb-5 rounded-2xl border border-warm-border bg-promo-panel p-4">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-clay">♧</div>
          <p className="text-[12px] font-semibold text-warm-text">Your work, in good hands.</p>
          <p className="mt-2 text-[11px] leading-5 text-muted-text">Submit, track, and get approved. All in one place.</p>
        </div>

        <div className="mt-auto border-t border-warm-border px-4 py-4">
          <div className="mb-3 truncate px-3 text-xs text-muted-text">{userEmail || 'Loading account...'}</div>
          <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">
            {isOfficeRole(role) ? role.replaceAll('_', ' ') : role || 'validating'}
          </div>
          <div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-text transition-colors hover:bg-white hover:text-warm-text max-md:min-h-11"
            >
              <span aria-hidden="true">⇥</span>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-30 lg:hidden" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      <main className="min-h-screen lg:ml-59.5">
        <header className="flex h-16 items-center justify-between border-b border-warm-border bg-card px-6 pl-19 lg:px-10 max-md:px-4 max-md:pl-16">
          <div className="hidden items-center gap-3 text-xs text-muted-text max-md:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-clay text-lg text-white" aria-hidden="true">▤</span>
            <span className="max-w-[8rem] text-[9px] font-bold leading-[11px] tracking-[0.05em] text-warm-text">
              Connect-Date.ai
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-text max-md:hidden">
            <span>Workspace</span><span aria-hidden="true">›</span><span className="font-medium text-warm-text">{pathname === '/workflow/user' ? 'Dashboard' : pathname.split('/').filter(Boolean).at(-1)?.replaceAll('_', ' ')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-56 truncate text-xs text-muted-text sm:block max-md:hidden">{userEmail}</span>
            <span className="rounded-md border border-clay-border bg-clay-soft px-2.5 py-1 text-[10px] font-medium capitalize text-clay max-md:hidden">{role || 'User'}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-avatar text-xs font-semibold text-warm-text max-md:h-10 max-md:w-10">{userEmail?.slice(0, 2).toUpperCase() || 'JD'}</span>
          </div>
        </header>
        <div className="mx-auto max-w-310 px-6 py-9 lg:px-10 max-md:px-4 max-md:py-5">
          {children}
        </div>
      </main>
    </div>
    </WorkflowRoleProvider>
  );
}