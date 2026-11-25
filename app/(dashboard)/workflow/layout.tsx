'use client';
import { logClientError } from '@/lib/clientLogger';

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
import Icon, { type IconName } from '@/components/ui/Icon';

interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  alert?: boolean;
}

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
      logClientError('Could not check unread notifications:', error.message);
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

  const navLinks = (): NavLink[] => {
    if (role === 'submitter') {
      return [
        { href: '/workflow/user', label: 'Dashboard', icon: 'dashboard' },
        { href: '/workflow/user/upload', label: 'Upload', icon: 'file-plus' },
        { href: '/workflow/user/file_registry', label: 'File Registry', icon: 'files' },
        { href: '/workflow/user/notifications', label: 'Notifications', icon: 'bell', alert: hasUnread && !pathname.includes('notifications') },
      ];
    }
    if (isOfficeRole(role)) {
      return [
        { href: getRoleHomePath(role), label: 'Dashboard', icon: 'dashboard' },
        { href: '/workflow/user/upload', label: 'New Request', icon: 'file-plus' },
        { href: '/workflow/user', label: 'My Requests', icon: 'files' },
        { href: getOfficeFileManagementPath(role), label: 'File Registry', icon: 'files' },
        { href: getOfficeNotificationsPath(role), label: 'Notifications', icon: 'bell', alert: hasUnread && !pathname.includes('notifications') },
        { href: '/workflow/retrieval', label: 'Scan QR Code', icon: 'qr' },
      ];
    }
    if (role === 'system_admin') {
      return [
        { href: '/workflow/admin', label: 'Dashboard', icon: 'dashboard' },
        { href: '/workflow/admin/user_management', label: 'User Registry', icon: 'users' },
        { href: '/workflow/admin/database-backup', label: 'Backup & Restore', icon: 'database' },
        { href: '/workflow/admin/system-logs', label: 'System Logs', icon: 'activity' },
        { href: '/workflow/admin/submissions', label: 'File Submissions', icon: 'files' },
        { href: '/workflow/admin/reports', label: 'Reports', icon: 'chart' },
        { href: '/workflow/admin/notifications', label: 'Notifications', icon: 'bell', alert: hasUnread },
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
        <Icon name={sidebarOpen ? 'x' : 'menu'} size={20} />
      </button>

      <aside className={`
        fixed top-0 left-0 z-40 h-full w-59.5 border-r border-warm-border bg-sidebar
        transition-transform duration-300 lg:translate-x-0
        flex flex-col max-lg:w-[min(80vw,18rem)] max-lg:overflow-y-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex h-16 items-center gap-3 border-b border-warm-border px-7">
          <span className="ui-pop flex h-9 w-9 items-center justify-center rounded-xl bg-clay text-white shadow-[0_6px_14px_-8px_var(--workflow-primary)]">
            <Icon name="file-check" size={19} />
          </span>
          <h1 className="whitespace-nowrap text-[15px] font-bold tracking-normal text-warm-text">Connect-Daet<span className="text-clay">.ai</span></h1>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-white/70 hover:text-warm-text lg:hidden"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <nav className="ui-stagger flex-1 space-y-1 px-4 py-8">
          <div className="mb-4 px-3 text-[11px] font-medium text-muted-text">Workspace</div>
          {navLinks().map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex items-center justify-between rounded-xl px-3 py-3 text-sm transition-all duration-200 ${active ? 'bg-clay-soft text-clay' : 'text-warm-text hover:translate-x-0.5 hover:bg-white/70'}`}
              >
                {/* Accent bar on the active item. */}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-clay transition-all duration-300 ${active ? 'opacity-100' : 'scale-y-0 opacity-0'}`}
                />
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 ${active ? 'bg-white text-clay shadow-sm' : 'text-muted-text group-hover:bg-white group-hover:text-clay'}`}
                  >
                    <Icon name={link.icon} size={16} />
                  </span>
                  <span className="font-medium">{link.label === 'Upload' ? 'New Submission' : link.label === 'File Registry' ? 'My Files' : link.label}</span>
                </div>
                {active && !link.alert && <span className="h-1.5 w-1.5 rounded-full bg-clay" />}
                {link.alert && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clay opacity-50 motion-reduce:animate-none"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-clay"></span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="group mx-5 mb-5 overflow-hidden rounded-2xl border border-warm-border bg-promo-panel p-4">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-clay transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
            <Icon name="shield-check" size={17} />
          </div>
          <p className="text-[12px] font-semibold text-warm-text">Your work, in good hands.</p>
          <p className="mt-2 text-[11px] leading-5 text-muted-text">Submit, track, and get approved. All in one place.</p>
        </div>

        <div className="mt-auto border-t border-warm-border px-4 py-4">
          <div className="mb-3 truncate px-3 text-xs text-muted-text">{userEmail || 'Loading account...'}</div>
          <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">
            {role === 'submitter' ? 'requestee' : role ? role.replaceAll('_', ' ') : 'validating'}
          </div>
          <div>
            <button
              onClick={handleLogout}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-text transition-colors hover:bg-white hover:text-rejected-text max-md:min-h-11"
            >
              <Icon name="logout" size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
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
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-clay text-white">
              <Icon name="file-check" size={19} />
            </span>
            <span className="whitespace-nowrap text-[15px] font-bold tracking-normal text-warm-text">Connect-Daet<span className="text-clay">.ai</span></span>
          </div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-text max-md:hidden">
            <Icon name="dashboard" size={14} />
            <span>Workspace</span>
            <Icon name="chevron-right" size={13} />
            <span key={pathname} className="ui-fade-up font-medium capitalize text-warm-text">
              {pathname === '/workflow/user' ? 'Dashboard' : pathname.split('/').filter(Boolean).at(-1)?.replaceAll('_', ' ').replaceAll('-', ' ')}
            </span>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-56 truncate text-xs text-muted-text sm:block max-md:hidden">{userEmail}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-clay-border bg-clay-soft px-2.5 py-1 text-[10px] font-medium capitalize text-clay max-md:hidden">
              <Icon name="user-check" size={12} />
              {role === 'submitter' ? 'requestee' : role?.replaceAll('_', ' ') || 'User'}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-avatar text-xs font-semibold text-warm-text ring-2 ring-card transition-transform duration-200 hover:scale-105 max-md:h-10 max-md:w-10">{userEmail?.slice(0, 2).toUpperCase() || 'JD'}</span>
          </div>
        </header>
        <div key={pathname} className="ui-fade-up mx-auto max-w-310 px-6 py-9 lg:px-10 max-md:px-4 max-md:py-5">
          {children}
        </div>
      </main>
    </div>
    </WorkflowRoleProvider>
  );
}