// The website has no Play Integrity or App Attest tickets: its AI will need an account instead
// (roadmap 6.1). The same export as tickets.ts: a missing one stopped the whole website loading
// (2026-11-05; TypeScript only checks tickets.ts).
import { NO_TICKETS, type TicketSource } from '@/lib/integrity';

export function ticketsFor(_baseUrl: string): TicketSource {
  return NO_TICKETS;
}
