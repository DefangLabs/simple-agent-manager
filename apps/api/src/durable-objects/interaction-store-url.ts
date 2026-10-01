import { type AcpInteractionAnswerDecision,eligibleAcpUrl, isJsonRecord } from '@simple-agent-manager/shared';

import type { AcpInteractionConfig } from '../services/acp-interaction-config';
import { sha256 } from './interaction-store-model';

export function validUrlCreateDetail(value: unknown, config: AcpInteractionConfig): boolean {
  if (!isJsonRecord(value) ||
      !Object.keys(value).every((key) => ['message', 'url', 'elicitationId'].includes(key)) ||
      typeof value.message !== 'string' || typeof value.url !== 'string' ||
      typeof value.elicitationId !== 'string') return false;
  return new TextEncoder().encode(value.message).byteLength <= config.requestMaxBytes &&
    value.elicitationId.length > 0 &&
    [...value.elicitationId].length <= config.urlElicitationIdMaxChars &&
    eligibleAcpUrl(value.url, config.urlMaxChars, config.urlRedirectDepth) !== null;
}

export async function validUrlAnswerDecision(decision: AcpInteractionAnswerDecision): Promise<boolean> {
  if (!['accepted', 'declined', 'cancelled'].includes(decision.kind) ||
      decision.content !== undefined || decision.optionId !== undefined ||
      decision.encryptedAnswer !== undefined) return false;
  return decision.answerHash === await sha256(decision.kind);
}
