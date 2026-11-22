import type { createClient } from '@/lib/supabase/client';
import { isOfficeRole, type OfficeRole } from './offices.ts';

export interface WorkflowOfficeDocumentType {
  office_role: OfficeRole;
  document_type: string;
}

type WorkflowSupabaseClient = ReturnType<typeof createClient>;

function isWorkflowOfficeDocumentType(value: unknown): value is WorkflowOfficeDocumentType {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.office_role === 'string'
    && isOfficeRole(record.office_role)
    && typeof record.document_type === 'string'
  );
}

export async function fetchWorkflowOfficeDocumentTypes(
  supabase: WorkflowSupabaseClient,
  officeRole?: OfficeRole,
): Promise<WorkflowOfficeDocumentType[]> {
  let query = supabase
    .from('workflow_office_document_types')
    .select('office_role, document_type')
    .order('document_type');

  if (officeRole) query = query.eq('office_role', officeRole);

  const { data, error } = await query;
  if (error) throw error;

  if (!Array.isArray(data) || !data.every(isWorkflowOfficeDocumentType)) {
    throw new Error('The office document type catalogue returned invalid data.');
  }

  return data;
}

export function getWorkflowDocumentTypesForOffice(
  documentTypes: readonly WorkflowOfficeDocumentType[],
  officeRole: OfficeRole | '',
): string[] {
  if (!officeRole) return [];
  return documentTypes
    .filter((documentType) => documentType.office_role === officeRole)
    .map((documentType) => documentType.document_type);
}
