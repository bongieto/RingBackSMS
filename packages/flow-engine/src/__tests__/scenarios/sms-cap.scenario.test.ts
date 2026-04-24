import { FlowType } from '@ringback/shared-types';
import { buildLumpiaContext } from './_fixtures';
import { runScenario } from './_harness';

/**
 * Regression coverage for fix #4: URL-aware SMS reply cap. When a long
 * reply ends with a URL and exceeds the 320-char cap, the cap must
 * trim prose before the URL instead of slicing mid-URL (which ships a
 * broken, unclickable link).
 */

describe('SMS reply cap', () => {
  test('fix #4: long FALLBACK reply ending in URL preserves the URL intact', async () => {
    const longProse = 'x'.repeat(280);
    const url = 'https://ringbacksms.com/m/the-lumpia-house-and-truck';
    const llmReply = `${longProse} ${url}`;

    await runScenario({
      name: 'fallback-cap-preserves-url',
      context: buildLumpiaContext({
        openNow: true,
        flowTypes: [FlowType.ORDER, FlowType.FALLBACK],
      }),
      turns: [
        {
          // Phrased to miss the MENU/ORDER keyword classifier so the
          // message routes through FALLBACK where the cap lives.
          user: 'do you guys deliver?',
          chatText: llmReply,
          expect: {
            flowType: FlowType.FALLBACK,
            // Cap preserves the URL at the tail of the reply.
            replyContains: url,
            assert: ({ reply }) => {
              // The truncated-prose sentinel (…) must appear BEFORE the
              // URL — not inside it. And the URL must appear intact at
              // end-of-string (no "…" after it, no mid-URL slice).
              const idxUrl = reply.indexOf(url);
              if (idxUrl < 0) throw new Error(`URL missing from reply: ${reply}`);
              const tail = reply.slice(idxUrl + url.length);
              if (tail.trim().length > 0) {
                throw new Error(
                  `extra content after URL (URL should be at tail): ${JSON.stringify(tail)}`,
                );
              }
              const before = reply.slice(0, idxUrl);
              if (before.length > 0 && !before.includes('…')) {
                throw new Error(
                  'expected ellipsis "…" marking where prose was trimmed',
                );
              }
            },
          },
        },
      ],
    });
  });
});
