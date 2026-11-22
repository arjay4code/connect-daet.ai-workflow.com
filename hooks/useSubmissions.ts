// src/hooks/useSubmissions.ts
'use client';
import { logClientError } from '@/lib/clientLogger';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkflowPolling } from '@/lib/workflow/useWorkflowPolling';

export interface Submission {
  id: string;
  user_id: string;
  tracking_number: string;
  file_name: string;
  file_url: string;
  file_path?: string | null;
  file_type: string;
  file_size?: number | null;
  category?: string | null;
  other_document_type?: string | null;
  status: string;
  rejection_comment: string | null;
  created_at: string;
  submitted_at?: string | null;
  verified_at?: string | null;
  approved_at?: string | null;
  completed_at?: string | null;
  current_stage_due_at?: string | null;
  current_responsible_role?: string | null;
  selected_office_role?: string | null;
  profiles: {
    email: string;
  };
}

export function useSubmissions(statusFilter?: string) {
  const supabase = useMemo(() => createClient(), []);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchInFlightRef = useRef(false);

  const fetchSubmissions = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      let query = supabase
        .from('workflow_submissions')
        .select(`
        *,
        profiles!user_id(email)
      `)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Submission list refresh failed:', error.message);
        return;
      }

      setSubmissions(data ?? []);
    } catch (error) {
      console.error('Submission list refresh failed:', error);
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [statusFilter, supabase]);

  // ✅ Admin: Final Approve
  const adminApprove = async (id: string) => {
    const { error } = await supabase
      .from('workflow_submissions')
      .update({ status: 'approved' })
      .eq('id', id);

    if (error) { logClientError('Approve error:', error.message); return; }

    await supabase.from('audit_logs').insert({
      submission_id: id,
      action: 'admin_approved',
    });

    fetchSubmissions();
  };

  // ✅ Admin: Decline with comment
  const adminDecline = async (id: string, comment: string) => {
    const { error } = await supabase
      .from('workflow_submissions')
      .update({ status: 'declined_by_admin', rejection_comment: comment })
      .eq('id', id);

    if (error) { logClientError('Decline error:', error.message); return; }

    await supabase.from('audit_logs').insert({
      submission_id: id,
      action: 'admin_declined',
      comment,
    });

    fetchSubmissions();
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void fetchSubmissions();
    });

    const channel = supabase
      .channel('realtime-admin-submissions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflow_submissions',
      }, () => void fetchSubmissions())
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [fetchSubmissions, supabase]);
  useWorkflowPolling(fetchSubmissions);

  return { submissions, loading, adminApprove, adminDecline, refreshSubmissions: fetchSubmissions };
}