'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface WorkflowAccountContextValue {
  role: string | null;
  userId: string | null;
  fullName: string | null;
  ready: boolean;
}

const WorkflowAccountContext = createContext<WorkflowAccountContextValue>({
  role: null,
  userId: null,
  fullName: null,
  ready: false,
});

export function WorkflowRoleProvider({
  role,
  userId,
  fullName,
  ready,
  children,
}: {
  role: string | null;
  userId: string | null;
  fullName: string | null;
  ready: boolean;
  children: ReactNode;
}) {
  const account = useMemo(
    () => ({ role, userId, fullName, ready }),
    [fullName, ready, role, userId],
  );

  return (
    <WorkflowAccountContext.Provider value={account}>
      {children}
    </WorkflowAccountContext.Provider>
  );
}

export function useWorkflowAccount() {
  return useContext(WorkflowAccountContext);
}

export function useWorkflowRole() {
  return useWorkflowAccount().role;
}
