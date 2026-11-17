'use client';

import { useSubmissions } from '@/hooks/useSubmissions';
import Link from 'next/link';

export default function PendingPage() {
  const { submissions, loading } = useSubmissions('pending_admin');

  const statusColor: Record<string, string> = {
    pending:              'bg-pending-bg text-pending-text',
    pending_approver:     'bg-pending-bg text-pending-text',
    pending_admin:        'bg-pending-bg text-pending-text',
    approved:             'bg-approved-bg text-approved-text',
    declined_by_approver: 'bg-rejected-bg text-rejected-text',
    declined_by_admin:    'bg-rejected-bg text-rejected-text',
  };

  return (
    <div className="min-h-screen bg-cream p-6 max-md:p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-warm-text">My Pending Reviews</h1>
        <p className="mt-1 text-sm text-muted-text">
          Verify the approver-selected office route or archive the request with a reason.
        </p>
      </div>

      <div className="rounded-2xl bg-card p-6 shadow max-md:p-3.5">
        {loading ? (
          <p className="text-muted-text">Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-text">No pending submissions for your review.</p>
          </div>
        ) : (
          <div className="max-lg:overflow-x-auto">
            <table className="w-full max-lg:min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-warm-border text-xs uppercase text-muted-text">
                  <th className="pb-3">File</th>
                  <th className="pb-3">Uploaded By</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr key={sub.id} className="border-b border-warm-border last:border-0 hover:bg-sidebar">
                    <td className="py-3">
                      <span
                        onClick={() => window.open(`/api/workflow/files/${sub.id}?redirect=1`, '_blank')}
                        className="text-blue-600 underline font-medium cursor-pointer"
                      >
                        {sub.file_name}
                      </span>
                    </td>
                    <td className="py-3 text-muted-text">{sub.profiles?.email ?? '—'}</td>
                    <td className="py-3 text-xs uppercase text-muted-text">{sub.file_type}</td>
                    <td className="py-3 text-muted-text">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[sub.status]}`}>
                        {sub.status === 'pending_admin' ? 'PENDING APPROVAL' : sub.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/workflow/admin/submissions/${sub.id}`}
                        className="inline-flex rounded-full bg-clay px-3 py-1 text-xs text-white hover:bg-blue-700"
                      >
                        Verify route
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}