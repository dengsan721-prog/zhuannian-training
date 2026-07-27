import type {
  MySafetyReportStatus,
  MySupportTicketStatus,
  SafetyReportInput,
  SupportTicketInput,
} from '../../domain/support/types';

export interface SupportRepository {
  createSupportTicket(
    input: SupportTicketInput,
  ): Promise<{
    ticketId: string;
    created: boolean;
    status: 'submitted' | 'withdrawn';
    snapshotShared: boolean;
  }>;
  listMySupportTickets(): Promise<MySupportTicketStatus[]>;
  revokeSupportConsent(input: {
    ticketId: string;
    requestId: string;
  }): Promise<{
    ticketId: string;
    status: 'withdrawn';
    snapshotShared: false;
  }>;
  stopTrainingForSafety(
    sessionId: string,
  ): Promise<{ sessionId: string; route: 'safety-stop' }>;
  createSafetyReport(
    input: SafetyReportInput,
  ): Promise<{
    reportId: string;
    created: boolean;
    status: 'submitted';
  }>;
  listMySafetyReports(): Promise<MySafetyReportStatus[]>;
}
