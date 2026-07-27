import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type {
  SafetyReportInput,
  SupportTicketInput,
} from '../../domain/support/types';
import { SupabaseSupportRepository } from './SupabaseSupportRepository';

type RpcResult = { data: unknown; error: unknown };

function fakeClient(result: RpcResult) {
  const single = vi.fn().mockResolvedValue(result);
  const builder = {
    single,
    then: (
      onFulfilled?: (value: RpcResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  const rpc = vi.fn(() => builder);
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
    single,
  };
}

const requestId = '30000000-0000-4000-8000-000000000001';
const secondRequestId = '30000000-0000-4000-8000-000000000002';
const ticketId = '40000000-0000-4000-8000-000000000001';
const completionId = '50000000-0000-4000-8000-000000000001';
const sceneVersionId = '60000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const reportId = '80000000-0000-4000-8000-000000000001';

const snapshotInput: SupportTicketInput = {
  kind: 'current_training_snapshot',
  requestId,
  consentToShare: true,
  completionId,
  snapshot: {
    sceneVersionId,
    selectedThought: { kind: 'option', optionId: 'disrespect' },
    selectedHypothesisIds: ['need-autonomy', 'rule-boundary'],
    evidence: {
      recurrence: 'repeated',
      knownFacts: 'partial',
      assumptions: 'present',
      danger: 'none-known',
      directlySolvable: 'partly',
      nextNeed: 'boundary',
    },
  },
  note: '  Cafe\u0301  ',
};

const safetyInput: SafetyReportInput = {
  requestId,
  confirmedByUser: true,
  sessionId,
  context: {
    source: 'user',
    signalCode: 'serious_threat',
  },
};

describe('SupabaseSupportRepository mutations', () => {
  it('creates no-snapshot help through exact snake-case RPC arguments', async () => {
    const data = {
      ticketId,
      created: true,
      status: 'submitted',
      snapshotShared: false,
    };
    const fake = fakeClient({ data, error: null });
    const repository = new SupabaseSupportRepository(fake.client);

    const result = await repository.createSupportTicket({
      kind: 'no_snapshot',
      requestId,
      note: '   ',
    });

    expect(fake.rpc).toHaveBeenCalledWith('create_support_ticket', {
      p_request_id: requestId,
      p_input: { kind: 'no_snapshot' },
    });
    expect(fake.single).toHaveBeenCalledTimes(1);
    expect(result).toEqual(data);
    expect(result).not.toBe(data);
  });

  it('constructs the consented lower-camel snapshot payload explicitly', async () => {
    const fake = fakeClient({
      data: {
        ticketId,
        created: true,
        status: 'submitted',
        snapshotShared: true,
      },
      error: null,
    });

    await new SupabaseSupportRepository(fake.client)
      .createSupportTicket(snapshotInput);

    expect(fake.rpc).toHaveBeenCalledWith('create_support_ticket', {
      p_request_id: requestId,
      p_input: {
        kind: 'current_training_snapshot',
        consentToShare: true,
        completionId,
        snapshot: {
          sceneVersionId,
          selectedThought: { kind: 'option', optionId: 'disrespect' },
          selectedHypothesisIds: ['need-autonomy', 'rule-boundary'],
          evidence: {
            recurrence: 'repeated',
            knownFacts: 'partial',
            assumptions: 'present',
            danger: 'none-known',
            directlySolvable: 'partly',
            nextNeed: 'boundary',
          },
        },
        note: 'Café',
      },
    });
  });

  it('creates every valid safety branch without client routing fields', async () => {
    const branches: SafetyReportInput[] = [
      safetyInput,
      {
        requestId,
        confirmedByUser: true,
        sessionId,
        context: { source: 'server' },
      },
      {
        requestId,
        confirmedByUser: true,
        context: {
          source: 'user',
          signalCode: 'medical_emergency',
        },
      },
    ];

    for (const input of branches) {
      const fake = fakeClient({
        data: {
          reportId,
          created: true,
          status: 'submitted',
        },
        error: null,
      });

      await new SupabaseSupportRepository(fake.client)
        .createSafetyReport(input);

      const expectedInput = input.context.source === 'server'
        ? {
          confirmedByUser: true,
          sessionId,
          context: { source: 'server' },
        }
        : !('sessionId' in input)
          ? {
            confirmedByUser: true,
            context: {
              source: 'user',
              signalCode: input.context.signalCode,
            },
          }
          : {
            confirmedByUser: true,
            sessionId,
            context: {
              source: 'user',
              signalCode: input.context.signalCode,
            },
          };
      expect(fake.rpc).toHaveBeenCalledWith('create_safety_report', {
        p_request_id: requestId,
        p_input: expectedInput,
      });
      expect(fake.single).toHaveBeenCalledTimes(1);
    }
  });

  it('revokes and safety-stops through exact RPCs and strict responses', async () => {
    const revokeFake = fakeClient({
      data: {
        ticketId,
        status: 'withdrawn',
        snapshotShared: false,
      },
      error: null,
    });
    const stopFake = fakeClient({
      data: { sessionId, route: 'safety-stop' },
      error: null,
    });

    await expect(new SupabaseSupportRepository(revokeFake.client)
      .revokeSupportConsent({ ticketId, requestId: secondRequestId }))
      .resolves.toEqual({
        ticketId,
        status: 'withdrawn',
        snapshotShared: false,
      });
    expect(revokeFake.rpc).toHaveBeenCalledWith('revoke_support_consent', {
      p_ticket_id: ticketId,
      p_request_id: secondRequestId,
    });
    expect(revokeFake.single).toHaveBeenCalledTimes(1);

    await expect(new SupabaseSupportRepository(stopFake.client)
      .stopTrainingForSafety(sessionId))
      .resolves.toEqual({ sessionId, route: 'safety-stop' });
    expect(stopFake.rpc).toHaveBeenCalledWith('stop_training_for_safety', {
      p_session_id: sessionId,
    });
    expect(stopFake.single).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ticket without consent', {
      kind: 'current_training_snapshot',
      requestId,
      consentToShare: false,
      completionId,
      snapshot: snapshotInput.kind === 'current_training_snapshot'
        ? snapshotInput.snapshot
        : null,
    }, 'ticket'],
    ['ticket with danger', {
      ...snapshotInput,
      snapshot: snapshotInput.kind === 'current_training_snapshot'
        ? {
          ...snapshotInput.snapshot,
          evidence: {
            ...snapshotInput.snapshot.evidence,
            danger: 'present',
          },
        }
        : null,
    }, 'ticket'],
    ['server report without session', {
      requestId,
      confirmedByUser: true,
      context: { source: 'server' },
    }, 'report'],
    ['report without confirmation', {
      requestId,
      confirmedByUser: false,
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    }, 'report'],
    ['revoke with extra key', {
      ticketId,
      requestId,
      note: 'private',
    }, 'revoke'],
    ['invalid safety-stop UUID', 'session-1', 'stop'],
  ])('rejects invalid %s before making an RPC', async (
    _label,
    input,
    operation,
  ) => {
    const fake = fakeClient({ data: null, error: null });
    const repository = new SupabaseSupportRepository(fake.client);

    let promise: Promise<unknown>;
    if (operation === 'ticket') {
      promise = repository.createSupportTicket(input as SupportTicketInput);
    } else if (operation === 'report') {
      promise = repository.createSafetyReport(input as SafetyReportInput);
    } else if (operation === 'revoke') {
      promise = repository.revokeSupportConsent(input as {
        ticketId: string;
        requestId: string;
      });
    } else {
      promise = repository.stopTrainingForSafety(input as string);
    }

    await expect(promise).rejects.toThrow();
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.single).not.toHaveBeenCalled();
  });

  it('rejects an over-16-KiB canonical snapshot with zero RPC calls', async () => {
    if (snapshotInput.kind !== 'current_training_snapshot') {
      throw new Error('expected snapshot input');
    }
    const oversized: SupportTicketInput = {
      kind: 'current_training_snapshot',
      requestId,
      consentToShare: true,
      completionId,
      snapshot: {
        sceneVersionId,
        selectedThought: {
          kind: 'option',
          optionId: 'a'.repeat(17 * 1024),
        },
        selectedHypothesisIds: ['need-autonomy', 'rule-boundary'],
        evidence: {
          recurrence: 'repeated',
          knownFacts: 'partial',
          assumptions: 'present',
          danger: 'none-known',
          directlySolvable: 'partly',
          nextNeed: 'boundary',
        },
      },
    };
    const fake = fakeClient({ data: null, error: null });

    await expect(new SupabaseSupportRepository(fake.client)
      .createSupportTicket(oversized))
      .rejects.toThrow('invalid_support_snapshot');
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.single).not.toHaveBeenCalled();
  });
});

describe('SupabaseSupportRepository response validation', () => {
  it.each([
    ['null', null],
    ['array', [{
      ticketId,
      created: true,
      status: 'submitted',
      snapshotShared: false,
    }]],
    ['missing field', {
      ticketId,
      created: true,
      status: 'submitted',
    }],
    ['extra field', {
      ticketId,
      created: true,
      status: 'submitted',
      snapshotShared: false,
      note: 'private',
    }],
    ['invalid UUID', {
      ticketId: 'ticket-1',
      created: true,
      status: 'submitted',
      snapshotShared: false,
    }],
    ['invalid status', {
      ticketId,
      created: true,
      status: 'assigned',
      snapshotShared: false,
    }],
    ['coerced boolean', {
      ticketId,
      created: 1,
      status: 'submitted',
      snapshotShared: false,
    }],
    ['no-snapshot mismatch', {
      ticketId,
      created: true,
      status: 'submitted',
      snapshotShared: true,
    }],
  ])('rejects malformed ticket result: %s', async (_label, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(new SupabaseSupportRepository(fake.client)
      .createSupportTicket({ kind: 'no_snapshot', requestId }))
      .rejects.toThrow('invalid_create_support_ticket_response');
  });

  it.each([
    ['null report', null],
    ['extra report field', {
      reportId,
      created: true,
      status: 'submitted',
      priority: 'urgent',
    }],
    ['invalid report status', {
      reportId,
      created: true,
      status: 'assigned',
    }],
  ])('rejects malformed safety result: %s', async (_label, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(new SupabaseSupportRepository(fake.client)
      .createSafetyReport(safetyInput))
      .rejects.toThrow('invalid_create_safety_report_response');
  });

  it('rejects mismatched revoke and stop identifiers', async () => {
    const revokeFake = fakeClient({
      data: {
        ticketId: completionId,
        status: 'withdrawn',
        snapshotShared: false,
      },
      error: null,
    });
    const stopFake = fakeClient({
      data: { sessionId: completionId, route: 'safety-stop' },
      error: null,
    });

    await expect(new SupabaseSupportRepository(revokeFake.client)
      .revokeSupportConsent({ ticketId, requestId }))
      .rejects.toThrow('invalid_revoke_support_consent_response');
    await expect(new SupabaseSupportRepository(stopFake.client)
      .stopTrainingForSafety(sessionId))
      .rejects.toThrow('invalid_stop_training_for_safety_response');
  });

  it('propagates every RPC error without local fallback data', async () => {
    const error = new Error('service unavailable');
    const operations = [
      (repository: SupabaseSupportRepository) =>
        repository.createSupportTicket({ kind: 'no_snapshot', requestId }),
      (repository: SupabaseSupportRepository) =>
        repository.listMySupportTickets(),
      (repository: SupabaseSupportRepository) =>
        repository.revokeSupportConsent({ ticketId, requestId }),
      (repository: SupabaseSupportRepository) =>
        repository.stopTrainingForSafety(sessionId),
      (repository: SupabaseSupportRepository) =>
        repository.createSafetyReport(safetyInput),
      (repository: SupabaseSupportRepository) =>
        repository.listMySafetyReports(),
    ];

    for (const operation of operations) {
      const fake = fakeClient({ data: null, error });
      await expect(operation(new SupabaseSupportRepository(fake.client)))
        .rejects.toBe(error);
    }
  });
});

describe('SupabaseSupportRepository minimal status lists', () => {
  it('maps, normalizes, and deterministically orders exact help statuses', async () => {
    const laterTicketId = '40000000-0000-4000-8000-000000000002';
    const data = [
      {
        ticketId,
        status: 'withdrawn',
        snapshotShared: false,
        submittedAt: '2026-07-22T20:00:00+08:00',
        firstResponseDueAt: '2026-07-23T20:00:00+08:00',
      },
      {
        ticketId: laterTicketId,
        status: 'submitted',
        snapshotShared: true,
        submittedAt: '2026-07-23T12:00:00.125Z',
        firstResponseDueAt: '2026-07-24T12:00:00.125Z',
      },
    ];
    const fake = fakeClient({ data, error: null });

    const result = await new SupabaseSupportRepository(fake.client)
      .listMySupportTickets();

    expect(fake.rpc).toHaveBeenCalledWith('list_my_support_tickets');
    expect(fake.single).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        ticketId: laterTicketId,
        status: 'submitted',
        snapshotShared: true,
        submittedAt: '2026-07-23T12:00:00.125Z',
        firstResponseDueAt: '2026-07-24T12:00:00.125Z',
      },
      {
        ticketId,
        status: 'withdrawn',
        snapshotShared: false,
        submittedAt: '2026-07-22T12:00:00.000Z',
        firstResponseDueAt: '2026-07-23T12:00:00.000Z',
      },
    ]);
    expect(result).not.toBe(data);
  });

  it('uses descending ticket ID as the stable equal-time tie-breaker', async () => {
    const largerTicketId = '40000000-0000-4000-8000-000000000002';
    const fake = fakeClient({
      data: [
        {
          ticketId,
          status: 'submitted',
          snapshotShared: false,
          submittedAt: '2026-07-22T12:00:00Z',
          firstResponseDueAt: '2026-07-23T12:00:00Z',
        },
        {
          ticketId: largerTicketId,
          status: 'submitted',
          snapshotShared: false,
          submittedAt: '2026-07-22T12:00:00+00:00',
          firstResponseDueAt: '2026-07-23T12:00:00+00:00',
        },
      ],
      error: null,
    });

    const result = await new SupabaseSupportRepository(fake.client)
      .listMySupportTickets();

    expect(result.map((item) => item.ticketId)).toEqual([
      largerTicketId,
      ticketId,
    ]);
  });

  it.each([
    ['null', null],
    ['object', {}],
    ['extra sensitive field', [{
      ticketId,
      status: 'submitted',
      snapshotShared: false,
      submittedAt: '2026-07-22T12:00:00.000Z',
      firstResponseDueAt: '2026-07-23T12:00:00.000Z',
      note: 'private',
    }]],
    ['bad time', [{
      ticketId,
      status: 'submitted',
      snapshotShared: false,
      submittedAt: '2026-02-29T12:00:00Z',
      firstResponseDueAt: '2026-07-23T12:00:00Z',
    }]],
    ['withdrawn still sharing', [{
      ticketId,
      status: 'withdrawn',
      snapshotShared: true,
      submittedAt: '2026-07-22T12:00:00Z',
      firstResponseDueAt: '2026-07-23T12:00:00Z',
    }]],
    ['duplicate ticket IDs', [
      {
        ticketId,
        status: 'submitted',
        snapshotShared: false,
        submittedAt: '2026-07-22T12:00:00Z',
        firstResponseDueAt: '2026-07-23T12:00:00Z',
      },
      {
        ticketId,
        status: 'withdrawn',
        snapshotShared: false,
        submittedAt: '2026-07-21T12:00:00Z',
        firstResponseDueAt: '2026-07-22T12:00:00Z',
      },
    ]],
  ])('rejects malformed help statuses: %s', async (_label, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(new SupabaseSupportRepository(fake.client)
      .listMySupportTickets())
      .rejects.toThrow('invalid_list_my_support_tickets_response');
  });

  it('maps and orders exact safety statuses with no details', async () => {
    const secondReportId = '80000000-0000-4000-8000-000000000002';
    const data = [
      {
        reportId,
        status: 'submitted',
        submittedAt: '2026-07-22T12:00:00Z',
      },
      {
        reportId: secondReportId,
        status: 'submitted',
        submittedAt: '2026-07-23T12:00:00+00:00',
      },
    ];
    const fake = fakeClient({ data, error: null });

    await expect(new SupabaseSupportRepository(fake.client)
      .listMySafetyReports())
      .resolves.toEqual([
        {
          reportId: secondReportId,
          status: 'submitted',
          submittedAt: '2026-07-23T12:00:00.000Z',
        },
        {
          reportId,
          status: 'submitted',
          submittedAt: '2026-07-22T12:00:00.000Z',
        },
      ]);
    expect(fake.rpc).toHaveBeenCalledWith('list_my_safety_reports');
    expect(fake.single).not.toHaveBeenCalled();
  });

  it.each([
    ['extra signal', [{
      reportId,
      status: 'submitted',
      submittedAt: '2026-07-22T12:00:00Z',
      signalCode: 'serious_threat',
    }]],
    ['duplicate IDs', [
      {
        reportId,
        status: 'submitted',
        submittedAt: '2026-07-22T12:00:00Z',
      },
      {
        reportId,
        status: 'submitted',
        submittedAt: '2026-07-23T12:00:00Z',
      },
    ]],
    ['unknown status', [{
      reportId,
      status: 'in_review',
      submittedAt: '2026-07-22T12:00:00Z',
    }]],
  ])('rejects malformed safety statuses: %s', async (_label, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(new SupabaseSupportRepository(fake.client)
      .listMySafetyReports())
      .rejects.toThrow('invalid_list_my_safety_reports_response');
  });
});
