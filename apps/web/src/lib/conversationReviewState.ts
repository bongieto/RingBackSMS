export interface ReviewDecisionState {
  status?: 'approved' | 'dismissed';
}

export interface ReviewFindingIdentity extends ReviewDecisionState {
  conversationId: string;
  category: string;
  evidence: string;
}

/** Administrative row updates must not make an unchanged transcript reviewable again. */
export function hasUnreviewedConversationMessages(
  messageCount: number,
  reviewedMessageCount: number,
): boolean {
  return messageCount > reviewedMessageCount;
}

function normalizeResolutionKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A decision follows the specific problem demonstrated by the transcript, not
 * every future problem in the same category. Including normalized evidence
 * suppresses model restatements while allowing a later recurrence through.
 */
export function getReviewFindingResolutionKey(
  finding: ReviewFindingIdentity,
): string | null {
  const conversationId = finding.conversationId.trim();
  const category = normalizeResolutionKeyPart(finding.category);
  const evidence = normalizeResolutionKeyPart(finding.evidence);
  if (!conversationId || !category || !evidence) return null;

  return JSON.stringify([conversationId, category, evidence]);
}

export function isReviewFindingResolved(
  finding: ReviewFindingIdentity,
  resolvedKeys: Set<string>,
): boolean {
  const key = getReviewFindingResolutionKey(finding);
  return !!finding.status || (key !== null && resolvedKeys.has(key));
}

export function countUnresolvedReviewFindings(
  findings: ReviewFindingIdentity[],
  resolvedKeys: Set<string>,
): number {
  return findings.reduce(
    (count, finding) => count + (isReviewFindingResolved(finding, resolvedKeys) ? 0 : 1),
    0,
  );
}

export function collectResolvedReviewFindingKeys(
  reports: Array<{ findings: unknown }>,
): Set<string> {
  const keys = new Set<string>();
  for (const report of reports) {
    if (!Array.isArray(report.findings)) continue;
    for (const value of report.findings) {
      if (!value || typeof value !== 'object') continue;
      const finding = value as Partial<ReviewFindingIdentity>;
      if (
        !finding.status ||
        typeof finding.conversationId !== 'string' ||
        typeof finding.category !== 'string' ||
        typeof finding.evidence !== 'string'
      ) {
        continue;
      }
      const key = getReviewFindingResolutionKey(finding as ReviewFindingIdentity);
      if (key !== null) keys.add(key);
    }
  }
  return keys;
}

export function suppressResolvedReviewFindings<T extends ReviewFindingIdentity>(
  findings: T[],
  resolvedKeys: Set<string>,
): T[] {
  return findings.filter((finding) => {
    const key = getReviewFindingResolutionKey(finding);
    return key === null || !resolvedKeys.has(key);
  });
}

export function indexVisibleReviewFindings<T extends ReviewFindingIdentity>(
  findings: T[],
  showResolved: boolean,
  resolvedKeys: Set<string>,
): Array<{ finding: T; findingIndex: number; resolvedByHistory: boolean }> {
  return findings
    .map((finding, findingIndex) => ({
      finding,
      findingIndex,
      resolvedByHistory: (() => {
        const key = getReviewFindingResolutionKey(finding);
        return !finding.status && key !== null && resolvedKeys.has(key);
      })(),
    }))
    .filter(
      ({ finding, resolvedByHistory }) => showResolved || (!finding.status && !resolvedByHistory),
    );
}
