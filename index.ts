import {
  buildJevRequest,
  compact,
  parseJevResponse,
  reductionRatio,
  type CompactOptions,
  type CompactResult,
  type JevAsker,
  type JevQuestions,
  type JevState,
  type Message,
} from './vendor/fast-jev-compaction/dist/index.js';

type PiContent = string | Array<Record<string, any>>;
type PiMessage = Record<string, any>;

type FastJevDetails = {
  adapter: 'pi-fast-jev-compaction';
  version: 1;
  stats: CompactResult['stats'];
  decisions: CompactResult['decisions'];
  reductionRatio: number;
};

type FastJevOptions = CompactOptions & {
  minReductionRatio?: number;
};

type FastJevSummaryResult =
  | { summary: string; details: FastJevDetails; fallbackReason?: undefined }
  | { fallbackReason: 'below-min-reduction'; ratio: number; summary?: undefined; details?: undefined };

function textFromContent(content: PiContent | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (part?.type === 'text') return part.text ?? '';
      if (part?.type === 'thinking') return part.thinking ? `[thinking]\n${part.thinking}` : '';
      if (part?.type === 'image') return '[image omitted]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function piMessagesToJevMessages(messages: readonly PiMessage[]): Message[] {
  return messages.map((message): Message => {
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        text: textFromContent(message.content),
        toolUses: Array.isArray(message.content)
          ? message.content
              .filter((part) => part?.type === 'toolCall')
              .map((part) => ({
                tool_use_id: String(part.id),
                tool: String(part.name),
                input: part.arguments && typeof part.arguments === 'object' ? part.arguments : {},
              }))
          : [],
      };
    }

    if (message.role === 'toolResult') {
      return {
        role: 'user',
        text: '',
        toolUses: [],
        toolResults: [
          {
            tool_use_id: String(message.toolCallId),
            text: textFromContent(message.content),
            isError: Boolean(message.isError),
          },
        ],
      };
    }

    if (message.role === 'bashExecution') {
      return {
        role: 'user',
        text: `[bash] ${message.command ?? ''}\n${message.output ?? ''}`.trim(),
        toolUses: [],
      };
    }

    if (message.role === 'compactionSummary') {
      return { role: 'user', text: `[previous compaction summary]\n${message.summary ?? ''}`, toolUses: [] };
    }

    if (message.role === 'branchSummary') {
      return { role: 'user', text: `[branch summary]\n${message.summary ?? ''}`, toolUses: [] };
    }

    if (message.role === 'custom') {
      return { role: 'user', text: textFromContent(message.content), toolUses: [] };
    }

    return { role: 'user', text: textFromContent(message.content), toolUses: [] };
  });
}

function formatJevTranscript(messages: readonly Message[], result: CompactResult, ratio: number): string {
  const lines = [
    '# fast-jev-compaction transcript',
    '',
    'Jev pruned stale tool calls/results. User and assistant text below is kept verbatim; tool output may be removed or head-truncated.',
    '',
    `Stats: ${Math.round(ratio * 100)}% reduction; ${result.stats.kept} kept, ${result.stats.resultsDropped} results truncated, ${result.stats.callsDropped} calls dropped, ${result.stats.pinned} pinned; ${result.stats.requests} Jev request(s).`,
    '',
    '<conversation>',
  ];

  for (const message of messages) {
    const label = message.role === 'assistant' ? 'Assistant' : 'User';
    if (message.text.trim()) lines.push(`[${label}]: ${message.text}`);
    for (const tool of message.toolUses) {
      lines.push(`[Tool call ${tool.tool_use_id}: ${tool.tool}] ${json(tool.input)}`);
      if (tool.text) lines.push(`[Tool result ${tool.tool_use_id}]${tool.isError ? ' (error)' : ''}: ${tool.text}`);
    }
    for (const result of message.toolResults ?? []) {
      lines.push(`[Tool result ${result.tool_use_id}]${result.isError ? ' (error)' : ''}: ${result.text}`);
    }
  }

  lines.push('</conversation>');
  return lines.join('\n');
}

export async function compactPiMessagesForSummary(
  piMessages: readonly PiMessage[],
  asker: JevAsker,
  options: FastJevOptions = {},
): Promise<FastJevSummaryResult> {
  const result = await compact(piMessagesToJevMessages(piMessages), asker, options);
  const ratio = reductionRatio(result);
  if (ratio < (options.minReductionRatio ?? 0.25)) {
    return { fallbackReason: 'below-min-reduction', ratio };
  }

  return {
    summary: formatJevTranscript(result.messages, result, ratio),
    details: {
      adapter: 'pi-fast-jev-compaction',
      version: 1,
      stats: result.stats,
      decisions: result.decisions,
      reductionRatio: ratio,
    },
  };
}

/** undefined when unset, so fast-jev-compaction's own DEFAULT_OPTIONS apply. */
function envNumber(name: string): number | undefined {
  const value = process.env[name];
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function envOptions(customInstructions?: string): FastJevOptions {
  return {
    goal: customInstructions || process.env.PI_FAST_JEV_GOAL || undefined,
    keepThreshold: envNumber('PI_FAST_JEV_KEEP_THRESHOLD'),
    preserveRecentMessages: envNumber('PI_FAST_JEV_PRESERVE_RECENT_MESSAGES'),
    maxStateTokens: envNumber('PI_FAST_JEV_MAX_STATE_TOKENS'),
    maxRequestTokens: envNumber('PI_FAST_JEV_MAX_REQUEST_TOKENS'),
    truncateHeadChars: envNumber('PI_FAST_JEV_TRUNCATE_HEAD_CHARS'),
    minReductionRatio: envNumber('PI_FAST_JEV_MIN_REDUCTION_RATIO'),
  };
}

function createJevAsker(config: { apiKey: string; model?: string; baseUrl?: string; signal?: AbortSignal }): JevAsker {
  return {
    async ask(state: JevState, questions: JevQuestions) {
      const request = buildJevRequest(config, state, questions);
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: config.signal,
      });
      return parseJevResponse(response.status, response.ok, await response.text());
    },
  };
}

export default function fastJevCompaction(pi: any) {
  pi.on('session_before_compact', async (event: any, ctx: any) => {
    const apiKey = process.env.PI_FAST_JEV_API_KEY || process.env.TYPESAFE_API_KEY;
    if (!apiKey) {
      ctx.ui?.notify?.('fast-jev-compaction: TYPESAFE_API_KEY not set; using default compaction', 'warning');
      return;
    }

    const { preparation, customInstructions, signal } = event;
    const previous = preparation.previousSummary
      ? [{ role: 'compactionSummary', summary: preparation.previousSummary }]
      : [];
    const messages = [...previous, ...preparation.messagesToSummarize, ...preparation.turnPrefixMessages];
    if (messages.length === 0) return;

    try {
      const compacted = await compactPiMessagesForSummary(
        messages,
        createJevAsker({
          apiKey,
          model: process.env.PI_FAST_JEV_MODEL || 'jev-latest',
          baseUrl: process.env.PI_FAST_JEV_BASE_URL,
          signal,
        }),
        envOptions(customInstructions),
      );

      if (compacted.fallbackReason) {
        ctx.ui?.notify?.(
          `fast-jev-compaction: below minimum reduction (${Math.round(compacted.ratio * 100)}%); using default compaction`,
          'warning',
        );
        return;
      }

      ctx.ui?.notify?.('fast-jev-compaction: replaced default compaction', 'info');
      return {
        compaction: {
          summary: compacted.summary,
          firstKeptEntryId: preparation.firstKeptEntryId,
          tokensBefore: preparation.tokensBefore,
          details: compacted.details,
        },
      };
    } catch (error) {
      ctx.ui?.notify?.(
        `fast-jev-compaction: ${error instanceof Error ? error.message : String(error)}; using default compaction`,
        'error',
      );
      return;
    }
  });
}
