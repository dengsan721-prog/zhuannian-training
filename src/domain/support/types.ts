import type {
  EvidenceSelection,
  FirstThoughtSelection,
  SafetySignalCode,
} from '../training/types';

export type SupportSnapshot = {
  sceneVersionId: string;
  selectedThought: FirstThoughtSelection;
  selectedHypothesisIds: string[];
  evidence: EvidenceSelection;
};

export type SupportTicketInput =
  | {
    kind: 'no_snapshot';
    requestId: string;
    note?: string;
  }
  | {
    kind: 'current_training_snapshot';
    requestId: string;
    consentToShare: true;
    completionId: string;
    snapshot: SupportSnapshot;
    note?: string;
  };

export type SafetyReportInput =
  | {
    requestId: string;
    confirmedByUser: true;
    sessionId: string;
    context: {
      source: 'user';
      signalCode: SafetySignalCode;
    };
  }
  | {
    requestId: string;
    confirmedByUser: true;
    sessionId: string;
    context: {
      source: 'server';
    };
  }
  | {
    requestId: string;
    confirmedByUser: true;
    context: {
      source: 'user';
      signalCode: SafetySignalCode;
    };
  };

export type MySupportTicketStatus = {
  ticketId: string;
  status: 'submitted' | 'withdrawn';
  snapshotShared: boolean;
  submittedAt: string;
  firstResponseDueAt: string;
};

export type MySafetyReportStatus = {
  reportId: string;
  status: 'submitted';
  submittedAt: string;
};
