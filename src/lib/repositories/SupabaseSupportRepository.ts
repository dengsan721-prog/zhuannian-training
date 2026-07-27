import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MySafetyReportStatus,
  MySupportTicketStatus,
  SafetyReportInput,
  SupportSnapshot,
  SupportTicketInput,
} from '../../domain/support/types';
import {
  isSupportUuid,
  parseSafetyReportInput,
  parseSupportTicketInput,
} from '../../domain/support/validation';
import type { FirstThoughtSelection } from '../../domain/training/types';
import type { SupportRepository } from './SupportRepository';

const responseTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index]);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0
      && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

type ParsedTimestamp = {
  normalized: string;
  epochMilliseconds: number;
  fractionalSecond: string;
};

function readTimestamp(value: unknown): ParsedTimestamp | null {
  if (typeof value !== 'string') return null;
  const match = responseTimestampPattern.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[10]);
  if (month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59) {
    return null;
  }

  const parsed = new Date(value);
  const epochMilliseconds = parsed.getTime();
  if (Number.isNaN(epochMilliseconds)) return null;
  return {
    normalized: parsed.toISOString(),
    epochMilliseconds,
    fractionalSecond: match[7] ?? '',
  };
}

function compareTextDescending(left: string, right: string): number {
  if (left < right) return 1;
  if (left > right) return -1;
  return 0;
}

function compareTimestampDescending(
  left: ParsedTimestamp,
  right: ParsedTimestamp,
): number {
  if (left.epochMilliseconds !== right.epochMilliseconds) {
    return left.epochMilliseconds > right.epochMilliseconds ? -1 : 1;
  }
  const precision = Math.max(
    left.fractionalSecond.length,
    right.fractionalSecond.length,
  );
  return compareTextDescending(
    left.fractionalSecond.padEnd(precision, '0'),
    right.fractionalSecond.padEnd(precision, '0'),
  );
}

function cloneFirstThought(
  value: FirstThoughtSelection,
): FirstThoughtSelection {
  if (value.kind === 'option') {
    return {
      kind: 'option',
      optionId: value.optionId,
    };
  }
  if (value.kind === 'uncertain') return { kind: 'uncertain' };
  if (value.kind === 'multiple') return { kind: 'multiple' };
  return { kind: 'none' };
}

function cloneSnapshot(value: SupportSnapshot): SupportSnapshot {
  return {
    sceneVersionId: value.sceneVersionId,
    selectedThought: cloneFirstThought(value.selectedThought),
    selectedHypothesisIds: value.selectedHypothesisIds.map((id) => id),
    evidence: {
      recurrence: value.evidence.recurrence,
      knownFacts: value.evidence.knownFacts,
      assumptions: value.evidence.assumptions,
      danger: value.evidence.danger,
      directlySolvable: value.evidence.directlySolvable,
      nextNeed: value.evidence.nextNeed,
    },
  };
}

function buildTicketRpcInput(input: SupportTicketInput): object {
  if (input.kind === 'no_snapshot') {
    if (input.note === undefined) {
      return { kind: 'no_snapshot' };
    }
    return {
      kind: 'no_snapshot',
      note: input.note,
    };
  }
  const snapshot = cloneSnapshot(input.snapshot);
  if (input.note === undefined) {
    return {
      kind: 'current_training_snapshot',
      consentToShare: true,
      completionId: input.completionId,
      snapshot,
    };
  }
  return {
    kind: 'current_training_snapshot',
    consentToShare: true,
    completionId: input.completionId,
    snapshot,
    note: input.note,
  };
}

function buildSafetyRpcInput(input: SafetyReportInput): object {
  if (input.context.source === 'server') {
    if (!('sessionId' in input)) {
      throw new Error('invalid_safety_report_input');
    }
    return {
      confirmedByUser: true,
      sessionId: input.sessionId,
      context: { source: 'server' },
    };
  }
  const context = {
    source: 'user',
    signalCode: input.context.signalCode,
  };
  if (!('sessionId' in input)) {
    return {
      confirmedByUser: true,
      context,
    };
  }
  return {
    confirmedByUser: true,
    sessionId: input.sessionId,
    context,
  };
}

type TicketMutationResult = {
  ticketId: string;
  created: boolean;
  status: 'submitted' | 'withdrawn';
  snapshotShared: boolean;
};

function readTicketMutationResult(
  value: unknown,
  input: SupportTicketInput,
): TicketMutationResult {
  if (!hasExactKeys(value, [
    'created',
    'snapshotShared',
    'status',
    'ticketId',
  ])
    || !isSupportUuid(value.ticketId)
    || typeof value.created !== 'boolean'
    || typeof value.snapshotShared !== 'boolean'
    || (value.status !== 'submitted' && value.status !== 'withdrawn')
    || (value.status === 'withdrawn'
      && (value.created || value.snapshotShared))
    || (input.kind === 'no_snapshot' && value.snapshotShared)
    || (input.kind === 'current_training_snapshot'
      && value.status === 'submitted'
      && !value.snapshotShared)) {
    throw new Error('invalid_create_support_ticket_response');
  }
  return {
    ticketId: value.ticketId,
    created: value.created,
    status: value.status,
    snapshotShared: value.snapshotShared,
  };
}

type SortableTicketStatus = {
  status: MySupportTicketStatus;
  submittedSort: ParsedTimestamp;
};

function readTicketStatus(value: unknown): SortableTicketStatus {
  if (!hasExactKeys(value, [
    'firstResponseDueAt',
    'snapshotShared',
    'status',
    'submittedAt',
    'ticketId',
  ])
    || !isSupportUuid(value.ticketId)
    || (value.status !== 'submitted' && value.status !== 'withdrawn')
    || typeof value.snapshotShared !== 'boolean'
    || (value.status === 'withdrawn' && value.snapshotShared)) {
    throw new Error('invalid_list_my_support_tickets_response');
  }
  const submittedAt = readTimestamp(value.submittedAt);
  const firstResponseDueAt = readTimestamp(value.firstResponseDueAt);
  if (submittedAt === null || firstResponseDueAt === null) {
    throw new Error('invalid_list_my_support_tickets_response');
  }
  return {
    status: {
      ticketId: value.ticketId,
      status: value.status,
      snapshotShared: value.snapshotShared,
      submittedAt: submittedAt.normalized,
      firstResponseDueAt: firstResponseDueAt.normalized,
    },
    submittedSort: submittedAt,
  };
}

function readTicketStatuses(value: unknown): MySupportTicketStatus[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_list_my_support_tickets_response');
  }
  const mapped = value.map(readTicketStatus);
  const ids = new Set(mapped.map((item) => item.status.ticketId));
  if (ids.size !== mapped.length) {
    throw new Error('invalid_list_my_support_tickets_response');
  }
  return mapped
    .sort((left, right) => (
      compareTimestampDescending(left.submittedSort, right.submittedSort)
      || compareTextDescending(
        left.status.ticketId,
        right.status.ticketId,
      )
    ))
    .map((item) => item.status);
}

type SortableSafetyStatus = {
  status: MySafetyReportStatus;
  submittedSort: ParsedTimestamp;
};

function readSafetyStatus(value: unknown): SortableSafetyStatus {
  if (!hasExactKeys(value, ['reportId', 'status', 'submittedAt'])
    || !isSupportUuid(value.reportId)
    || value.status !== 'submitted') {
    throw new Error('invalid_list_my_safety_reports_response');
  }
  const submittedAt = readTimestamp(value.submittedAt);
  if (submittedAt === null) {
    throw new Error('invalid_list_my_safety_reports_response');
  }
  return {
    status: {
      reportId: value.reportId,
      status: 'submitted',
      submittedAt: submittedAt.normalized,
    },
    submittedSort: submittedAt,
  };
}

function readSafetyStatuses(value: unknown): MySafetyReportStatus[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_list_my_safety_reports_response');
  }
  const mapped = value.map(readSafetyStatus);
  const ids = new Set(mapped.map((item) => item.status.reportId));
  if (ids.size !== mapped.length) {
    throw new Error('invalid_list_my_safety_reports_response');
  }
  return mapped
    .sort((left, right) => (
      compareTimestampDescending(left.submittedSort, right.submittedSort)
      || compareTextDescending(
        left.status.reportId,
        right.status.reportId,
      )
    ))
    .map((item) => item.status);
}

function readRevokeInput(value: unknown): {
  ticketId: string;
  requestId: string;
} {
  if (!hasExactKeys(value, ['requestId', 'ticketId'])
    || !isSupportUuid(value.ticketId)
    || !isSupportUuid(value.requestId)) {
    throw new Error('invalid_revoke_support_consent_input');
  }
  return {
    ticketId: value.ticketId,
    requestId: value.requestId,
  };
}

function readRevokeResult(
  value: unknown,
  ticketId: string,
): {
  ticketId: string;
  status: 'withdrawn';
  snapshotShared: false;
} {
  if (!hasExactKeys(value, ['snapshotShared', 'status', 'ticketId'])
    || value.ticketId !== ticketId
    || !isSupportUuid(value.ticketId)
    || value.status !== 'withdrawn'
    || value.snapshotShared !== false) {
    throw new Error('invalid_revoke_support_consent_response');
  }
  return {
    ticketId: value.ticketId,
    status: 'withdrawn',
    snapshotShared: false,
  };
}

function readSafetyStopResult(
  value: unknown,
  sessionId: string,
): { sessionId: string; route: 'safety-stop' } {
  if (!hasExactKeys(value, ['route', 'sessionId'])
    || value.sessionId !== sessionId
    || !isSupportUuid(value.sessionId)
    || value.route !== 'safety-stop') {
    throw new Error('invalid_stop_training_for_safety_response');
  }
  return {
    sessionId: value.sessionId,
    route: 'safety-stop',
  };
}

function readSafetyMutationResult(value: unknown): {
  reportId: string;
  created: boolean;
  status: 'submitted';
} {
  if (!hasExactKeys(value, ['created', 'reportId', 'status'])
    || !isSupportUuid(value.reportId)
    || typeof value.created !== 'boolean'
    || value.status !== 'submitted') {
    throw new Error('invalid_create_safety_report_response');
  }
  return {
    reportId: value.reportId,
    created: value.created,
    status: 'submitted',
  };
}

export class SupabaseSupportRepository implements SupportRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createSupportTicket(
    input: SupportTicketInput,
  ): Promise<TicketMutationResult> {
    const validated = parseSupportTicketInput(input);
    const { data, error } = await this.client.rpc(
      'create_support_ticket',
      {
        p_request_id: validated.requestId,
        p_input: buildTicketRpcInput(validated),
      },
    ).single();
    if (error) throw error;
    return readTicketMutationResult(data, validated);
  }

  async listMySupportTickets(): Promise<MySupportTicketStatus[]> {
    const { data, error } = await this.client.rpc(
      'list_my_support_tickets',
    );
    if (error) throw error;
    return readTicketStatuses(data);
  }

  async revokeSupportConsent(input: {
    ticketId: string;
    requestId: string;
  }): Promise<{
    ticketId: string;
    status: 'withdrawn';
    snapshotShared: false;
  }> {
    const validated = readRevokeInput(input);
    const { data, error } = await this.client.rpc(
      'revoke_support_consent',
      {
        p_ticket_id: validated.ticketId,
        p_request_id: validated.requestId,
      },
    ).single();
    if (error) throw error;
    return readRevokeResult(data, validated.ticketId);
  }

  async stopTrainingForSafety(
    sessionId: string,
  ): Promise<{ sessionId: string; route: 'safety-stop' }> {
    if (!isSupportUuid(sessionId)) {
      throw new Error('invalid_stop_training_for_safety_input');
    }
    const { data, error } = await this.client.rpc(
      'stop_training_for_safety',
      { p_session_id: sessionId },
    ).single();
    if (error) throw error;
    return readSafetyStopResult(data, sessionId);
  }

  async createSafetyReport(
    input: SafetyReportInput,
  ): Promise<{
    reportId: string;
    created: boolean;
    status: 'submitted';
  }> {
    const validated = parseSafetyReportInput(input);
    const { data, error } = await this.client.rpc(
      'create_safety_report',
      {
        p_request_id: validated.requestId,
        p_input: buildSafetyRpcInput(validated),
      },
    ).single();
    if (error) throw error;
    return readSafetyMutationResult(data);
  }

  async listMySafetyReports(): Promise<MySafetyReportStatus[]> {
    const { data, error } = await this.client.rpc('list_my_safety_reports');
    if (error) throw error;
    return readSafetyStatuses(data);
  }
}
