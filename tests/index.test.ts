import assert from 'node:assert/strict';
import test from 'node:test';
import { compactPiMessagesForSummary, piMessagesToJevMessages } from '../index.ts';
import type { JevAsker, JevQuestions } from '../vendor/fast-jev-compaction/dist/index.js';

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function fakeJev(answer: (question: string) => number): JevAsker {
  return {
    async ask(_state, questions: JevQuestions) {
      return {
        answers: Object.fromEntries(
          Object.keys(questions).map((key) => [key, { type: 'noul' as const, noul: answer(key) }]),
        ),
      };
    },
  };
}

const messages = [
  { role: 'user', content: 'Fix the bug', timestamp: 1 },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'I will inspect the file.' },
      { type: 'toolCall', id: 'read-1', name: 'read', arguments: { path: 'src/a.ts' } },
    ],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage,
    stopReason: 'toolUse',
    timestamp: 2,
  },
  {
    role: 'toolResult',
    toolCallId: 'read-1',
    toolName: 'read',
    content: [{ type: 'text', text: 'very long file contents '.repeat(20) }],
    isError: false,
    timestamp: 3,
  },
  {
    role: 'assistant',
    content: [{ type: 'text', text: 'The bug is in src/a.ts.' }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage,
    stopReason: 'stop',
    timestamp: 4,
  },
] as any[];

test('maps pi tool calls and tool results to Jev messages', () => {
  const mapped = piMessagesToJevMessages(messages);
  assert.equal(mapped.length, 4);
  assert.equal(mapped[1].toolUses[0].tool_use_id, 'read-1');
  assert.equal(mapped[1].toolUses[0].tool, 'read');
  assert.deepEqual(mapped[1].toolUses[0].input, { path: 'src/a.ts' });
  assert.equal(mapped[2].toolResults?.[0].text, 'very long file contents '.repeat(20));
});

test('returns a serialized fast-jev compacted transcript summary', async () => {
  const result = await compactPiMessagesForSummary(messages, fakeJev((key) => key === 'call_t1' ? 0.9 : 0.1), {
    preserveRecentMessages: 0,
    keepThreshold: 0.5,
    minReductionRatio: 0,
    truncateHeadChars: 5,
  });

  assert.match(result.summary, /fast-jev-compaction/);
  assert.match(result.summary, /Fix the bug/);
  assert.match(result.summary, /Tool call read-1: read/);
  assert.match(result.summary, /truncated/);
  assert.doesNotMatch(result.summary, /very long file contents/);
  assert.equal(result.details.stats.calls, 1);
  assert.equal(result.details.decisions[0].action, 'drop_result');
});

test('signals fallback when Jev cannot reduce enough', async () => {
  const result = await compactPiMessagesForSummary(messages, fakeJev(() => 1), {
    preserveRecentMessages: 0,
    minReductionRatio: 0.25,
  });
  assert.equal(result.fallbackReason, 'below-min-reduction');
});
