'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_CONFIG, type OfficeRole } from '@/lib/workflow/offices';
import { fetchWorkflowOfficeDocumentTypes } from '@/lib/workflow/document-types';

type FinalDecisionOfficeRole = Exclude<OfficeRole, 'tourism_officer'>;

const FINAL_DECISION_OFFICE_ROLES: readonly FinalDecisionOfficeRole[] = [
  'municipal_treasurer',
  'mayor_office',
  'sangguniang_bayan',
];

interface Authority {
  id: string;
  office_role: FinalDecisionOfficeRole;
  document_type: string | null;
  required_profile_role: FinalDecisionOfficeRole;
  updated_at: string;
}

export default function WorkflowAuthoritySettings() {
  const supabase = useMemo(() => createClient(), []);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [officeRole, setOfficeRole] = useState<FinalDecisionOfficeRole>('municipal_treasurer');
  const [documentType, setDocumentType] = useState('');
  const [availableDocumentTypes, setAvailableDocumentTypes] = useState<string[]>([]);
  const [documentTypesLoading, setDocumentTypesLoading] = useState(true);
  const [documentTypesError, setDocumentTypesError] = useState('');
  const [documentTypesReloadKey, setDocumentTypesReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAuthorities = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('workflow_final_decision_authorities')
      .select('id, office_role, document_type, required_profile_role, updated_at')
      .order('office_role')
      .order('document_type');

    if (loadError) {
      console.error('Final decision authority load failed:', loadError.message);
      setError('Could not load final decision authority settings.');
    } else {
      setAuthorities((data ?? []) as Authority[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadAuthorities();
  }, [loadAuthorities]);

  useEffect(() => {
    let active = true;
    setAvailableDocumentTypes([]);
    setDocumentTypesError('');
    setDocumentTypesLoading(true);

    void fetchWorkflowOfficeDocumentTypes(supabase, officeRole)
      .then((documentTypes) => {
        if (active) {
          setAvailableDocumentTypes(
            documentTypes.map((documentType) => documentType.document_type)
          );
        }
      })
      .catch((loadError: unknown) => {
        console.error('Final decision authority document type load failed:', loadError);
        if (active) setDocumentTypesError('Could not load document types for this office.');
      })
      .finally(() => {
        if (active) setDocumentTypesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [documentTypesReloadKey, officeRole, supabase]);

  const saveAuthority = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    const { error: saveError } = await supabase.rpc(
      'configure_workflow_final_decision_authority',
      {
        authority_office_role: officeRole,
        authority_document_type: documentType || null,
      }
    );

    if (saveError) {
      console.error('Final decision authority save failed:', saveError.message);
      setError(saveError.message || 'Could not save final decision authority.');
    } else {
      setSuccess('Final decision authority saved.');
      await loadAuthorities();
    }
    setSaving(false);
  };

  const removeAuthority = async (authority: Authority) => {
    setError('');
    setSuccess('');
    const { error: removeError } = await supabase.rpc(
      'remove_workflow_final_decision_authority',
      { authority_id: authority.id }
    );
    if (removeError) {
      console.error('Final decision authority removal failed:', removeError.message);
      setError(removeError.message || 'Could not remove final decision authority.');
      return;
    }
    setSuccess('Final decision authority removed.');
    await loadAuthorities();
  };

  return (
    <section className="mb-6 rounded-2xl border border-warm-border bg-card p-5 max-md:p-3.5">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-warm-text">Final decision authority</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-text">
          Configure authority by municipal office and document type. A document-specific rule
          takes precedence over that office’s default. The required role is the office membership
          role; Tourism Officers and administrators do not receive final authority automatically.
        </p>
      </header>

      <form onSubmit={saveAuthority} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="text-[11px] font-medium text-muted-text">
          Municipal office
          <select
            value={officeRole}
            onChange={(event) => {
              const nextOfficeRole = event.target.value as FinalDecisionOfficeRole;
              if (FINAL_DECISION_OFFICE_ROLES.includes(nextOfficeRole)) {
                setOfficeRole(nextOfficeRole);
                setDocumentType('');
              }
            }}
            className="mt-1 h-11 w-full rounded-xl border border-warm-border bg-card px-3 text-xs text-warm-text"
          >
            {FINAL_DECISION_OFFICE_ROLES.map((role) => (
              <option key={role} value={role}>{OFFICE_CONFIG[role].label}</option>
            ))}
          </select>
        </label>

        <label className="text-[11px] font-medium text-muted-text">
          Document type
          <select
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
            disabled={documentTypesLoading || Boolean(documentTypesError)}
            className="mt-1 h-11 w-full rounded-xl border border-warm-border bg-card px-3 text-xs text-warm-text"
          >
            <option value="">
              {documentTypesLoading ? 'Loading document types...' : 'Office-wide default'}
            </option>
            {availableDocumentTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          {documentTypesError && (
            <span role="alert" className="mt-1 block text-[10px] text-rejected-text">
              {documentTypesError}{' '}
              <button
                type="button"
                onClick={() => setDocumentTypesReloadKey((key) => key + 1)}
                className="font-semibold underline"
              >
                Retry
              </button>
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={saving}
          className="self-end inline-flex h-11 items-center justify-center rounded-full bg-clay px-5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save authority'}
        </button>
      </form>

      {error && <p role="alert" className="mt-3 text-xs text-rejected-text">{error}</p>}
      {success && <p role="status" className="mt-3 text-xs text-approved-text">{success}</p>}

      {loading ? (
        <p className="mt-5 text-xs text-muted-text">Loading authority settings...</p>
      ) : authorities.length === 0 ? (
        <p className="mt-5 rounded-xl bg-sidebar p-4 text-xs text-muted-text">
          No final-decision authority is configured. Final approvals will be blocked until an
          office default or document-specific rule is added.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-warm-border rounded-xl border border-warm-border">
          {authorities.map((authority) => (
            <li
              key={authority.id}
              className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-xs font-semibold text-warm-text">
                  {OFFICE_CONFIG[authority.office_role].label}
                  <span className="mx-2 text-muted-text">·</span>
                  {authority.document_type || 'Office-wide default'}
                </p>
                <p className="mt-1 text-[10px] text-muted-text">
                  Required active office role: {OFFICE_CONFIG[authority.required_profile_role].label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void removeAuthority(authority)}
                className="h-9 shrink-0 rounded-full border border-rejected-bg px-4 text-[11px] font-semibold text-rejected-text hover:bg-rejected-bg/40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
