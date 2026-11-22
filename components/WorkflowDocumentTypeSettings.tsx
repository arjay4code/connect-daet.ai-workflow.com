'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchWorkflowOfficeDocumentTypes,
  getWorkflowDocumentTypesForOffice,
} from '@/lib/workflow/document-types';
import { isOfficeRole, OFFICE_CONFIG, type OfficeRole } from '@/lib/workflow/offices';

export default function WorkflowDocumentTypeSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [officeRole, setOfficeRole] = useState<OfficeRole>('municipal_treasurer');
  const [documentTypes, setDocumentTypes] = useState<
    Awaited<ReturnType<typeof fetchWorkflowOfficeDocumentTypes>>
  >([]);
  const [newDocumentType, setNewDocumentType] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingDocumentType, setDeletingDocumentType] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDocumentTypes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDocumentTypes(await fetchWorkflowOfficeDocumentTypes(supabase));
    } catch (loadError) {
      console.error('Office document type catalogue load failed:', loadError);
      setError('Could not load the office document type catalogue.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadDocumentTypes();
  }, [loadDocumentTypes]);

  const selectedOfficeTypes = getWorkflowDocumentTypesForOffice(documentTypes, officeRole);

  const addDocumentType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedDocumentType = newDocumentType.trim();
    if (!normalizedDocumentType || saving) return;

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { error: addError } = await supabase.rpc(
        'add_workflow_office_document_type',
        {
          target_office_role: officeRole,
          target_document_type: normalizedDocumentType,
        },
      );

      if (addError) {
        console.error('Office document type add failed:', addError.message);
        setError(addError.message || 'Could not add this document type.');
      } else {
        setNewDocumentType('');
        setSuccess(`Added “${normalizedDocumentType}” to ${OFFICE_CONFIG[officeRole].label}.`);
        await loadDocumentTypes();
      }
    } catch (addError) {
      console.error('Office document type add failed:', addError);
      setError(addError instanceof Error ? addError.message : 'Could not add this document type.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDocumentType = async (documentType: string) => {
    if (documentType === 'Other' || deletingDocumentType) return;
    const confirmed = window.confirm(
      `Permanently remove “${documentType}” from ${OFFICE_CONFIG[officeRole].label}?\n\nExisting submission records keep their saved document type. Deletion is blocked while an open submission or document-specific final-decision authority still uses it.`,
    );
    if (!confirmed) return;

    setDeletingDocumentType(documentType);
    setError('');
    setSuccess('');
    try {
      const { error: deleteError } = await supabase.rpc(
        'delete_workflow_office_document_type',
        {
          target_office_role: officeRole,
          target_document_type: documentType,
        },
      );

      if (deleteError) {
        console.error('Office document type delete failed:', deleteError.message);
        setError(deleteError.message || 'Could not delete this document type.');
      } else {
        setSuccess(`Removed “${documentType}” from ${OFFICE_CONFIG[officeRole].label}.`);
        await loadDocumentTypes();
      }
    } catch (deleteError) {
      console.error('Office document type delete failed:', deleteError);
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this document type.');
    } finally {
      setDeletingDocumentType(null);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-warm-border bg-card p-4 max-md:p-3.5">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-warm-text">Submission document types</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-text">
          Configure the options shown to submitters. “Other” stays available; deletions preserve
          history and are blocked while a type is still in use.
        </p>
      </header>

      <label className="block max-w-md text-[11px] font-medium text-muted-text">
        Office
        <select
          value={officeRole}
          onChange={(event) => {
            const value = event.target.value;
            if (isOfficeRole(value)) {
              setOfficeRole(value);
              setError('');
              setSuccess('');
            }
          }}
          className="mt-1 h-11 w-full rounded-xl border border-warm-border bg-card px-3 text-xs text-warm-text"
        >
          {Object.entries(OFFICE_CONFIG).map(([role, office]) => (
            <option key={role} value={role}>{office.label}</option>
          ))}
        </select>
      </label>

      <form onSubmit={(event) => void addDocumentType(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="new-workflow-document-type">New document type</label>
        <input
          id="new-workflow-document-type"
          value={newDocumentType}
          onChange={(event) => setNewDocumentType(event.target.value)}
          maxLength={120}
          placeholder="Enter a document type"
          className="h-11 min-w-0 flex-1 rounded-xl border border-warm-border bg-card px-4 text-xs text-warm-text outline-none focus:border-clay"
        />
        <button
          type="submit"
          disabled={saving || !newDocumentType.trim()}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-clay px-5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add type'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-xs text-rejected-text">
          {error}{' '}
          {error === 'Could not load the office document type catalogue.' ? (
            <button type="button" onClick={() => void loadDocumentTypes()} className="font-semibold underline">
              Retry
            </button>
          ) : null}
        </p>
      )}
      {success && <p role="status" className="mt-3 text-xs text-approved-text">{success}</p>}

      {loading ? (
        <p className="mt-4 text-xs text-muted-text">Loading document types...</p>
      ) : selectedOfficeTypes.length === 0 ? (
        <p className="mt-4 rounded-xl bg-sidebar p-4 text-xs text-muted-text">
          No document types are configured for this office.
        </p>
      ) : (
        <details className="mt-3 overflow-hidden rounded-xl border border-warm-border">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-warm-text marker:text-clay">
            View and manage document types ({selectedOfficeTypes.length})
          </summary>
          <ul className="max-h-60 divide-y divide-warm-border overflow-y-auto border-t border-warm-border">
            {selectedOfficeTypes.map((documentType) => (
              <li
                key={documentType}
                className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="break-words text-xs font-medium text-warm-text">{documentType}</span>
                {documentType === 'Other' ? (
                  <span className="shrink-0 text-[10px] text-muted-text">Protected</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void deleteDocumentType(documentType)}
                    disabled={deletingDocumentType !== null}
                    className="h-8 shrink-0 rounded-full border border-rejected-bg px-4 text-[11px] font-semibold text-rejected-text hover:bg-rejected-bg/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingDocumentType === documentType ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
