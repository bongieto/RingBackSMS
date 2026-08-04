import {
  collectResolvedReviewFindingKeys,
  countUnresolvedReviewFindings,
  hasUnreviewedConversationMessages,
  indexVisibleReviewFindings,
  suppressResolvedReviewFindings,
} from './conversationReviewState';

describe('conversation review eligibility', () => {
  it('does not re-review when only administrative fields changed', () => {
    expect(hasUnreviewedConversationMessages(8, 8)).toBe(false);
  });

  it('reviews a conversation after a new message arrives', () => {
    expect(hasUnreviewedConversationMessages(9, 8)).toBe(true);
  });
});

describe('conversation review visibility', () => {
  const findings = [
    { conversationId: '1', category: 'loops', evidence: 'BOT: Please try again.', issue: 'pending' },
    {
      conversationId: '2',
      category: 'tone',
      evidence: 'BOT: Reply YES.',
      issue: 'task created',
      status: 'approved' as const,
    },
    {
      conversationId: '3',
      category: 'risk',
      evidence: 'BOT: That always costs $10.',
      issue: 'not an issue',
      status: 'dismissed' as const,
    },
  ];
  const resolvedKeys = collectResolvedReviewFindingKeys([{ findings }]);

  it('counts only findings that still need a decision', () => {
    expect(countUnresolvedReviewFindings(findings, resolvedKeys)).toBe(1);
  });

  it('keeps original indexes when resolved findings are hidden', () => {
    expect(indexVisibleReviewFindings(findings, false, resolvedKeys)).toEqual([
      { finding: findings[0], findingIndex: 0, resolvedByHistory: false },
    ]);
  });

  it('retains the full audit history when requested', () => {
    expect(indexVisibleReviewFindings(findings, true, resolvedKeys)).toHaveLength(3);
  });
});

describe('resolved finding suppression across runs', () => {
  const resolved = {
    conversationId: 'conversation-1',
    category: 'Ignored Content',
    evidence: 'BOT: What else would you like?',
    status: 'approved' as const,
  };

  it('suppresses a restatement of the same decided transcript evidence', () => {
    const keys = collectResolvedReviewFindingKeys([{ findings: [resolved] }]);
    const current = [
      {
        conversationId: 'conversation-1',
        category: 'IGNORED   CONTENT',
        evidence: '  bot: what else would you like? ',
        issue: 'same issue',
      },
      {
        conversationId: 'conversation-1',
        category: 'LOOPS',
        evidence: 'BOT: Please choose again.',
        issue: 'different issue',
      },
    ];

    expect(suppressResolvedReviewFindings(current, keys)).toEqual([current[1]]);
  });

  it('keeps a genuine recurrence with new evidence in the same category', () => {
    const keys = collectResolvedReviewFindingKeys([{ findings: [resolved] }]);
    const recurrence = {
      conversationId: 'conversation-1',
      category: 'Ignored Content',
      evidence: 'BOT: Would you like to start a new order?',
      issue: 'the bot ignored a different request later in the transcript',
    };

    expect(suppressResolvedReviewFindings([recurrence], keys)).toEqual([recurrence]);
  });

  it('ignores malformed or evidence-free history instead of broadly suppressing findings', () => {
    expect(
      collectResolvedReviewFindingKeys([
        { findings: null },
        { findings: ['bad'] },
        {
          findings: [
            {
              conversationId: 'conversation-1',
              category: 'Ignored Content',
              status: 'dismissed',
            },
          ],
        },
      ]).size,
    ).toBe(0);
  });
});
