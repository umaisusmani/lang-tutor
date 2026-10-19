import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_MESSAGES,
  parseChatRequest,
} from '@/lib/chat-request';

const conversationId = '4f40381f-cd46-4cf6-ae72-1ea3cbce7446';

describe('parseChatRequest', () => {
  it('accepts a normal transcript and strips UI-only data parts', () => {
    const parsed = parseChatRequest({
      id: 'ai-sdk-chat-id',
      trigger: 'submit-message',
      messageId: 'two',
      conversationId,
      level: 'B1',
      messages: [
        { id: 'one', role: 'assistant', parts: [{ type: 'text', text: 'Hallo!' }] },
        {
          id: 'two',
          role: 'user',
          parts: [
            { type: 'text', text: 'Wie geht es dir?' },
            { type: 'data-conversation', data: { id: conversationId } },
          ],
        },
      ],
    });

    assert.ok(parsed);
    assert.equal(parsed.level, 'B1');
    assert.deepEqual(parsed.messages[1].parts, [{ type: 'text', text: 'Wie geht es dir?' }]);
  });

  it('rejects malformed ids, levels, and transcripts that do not end with a user message', () => {
    assert.equal(
      parseChatRequest({
        conversationId: 'not-a-uuid',
        level: 'C2',
        messages: [{ id: 'one', role: 'assistant', parts: [{ type: 'text', text: 'Hallo' }] }],
      }),
      null,
    );
  });

  it('rejects oversized messages and histories', () => {
    assert.equal(
      parseChatRequest({
        messages: [
          {
            id: 'one',
            role: 'user',
            parts: [{ type: 'text', text: 'x'.repeat(MAX_CHAT_MESSAGE_CHARS + 1) }],
          },
        ],
      }),
      null,
    );

    assert.equal(
      parseChatRequest({
        messages: Array.from({ length: MAX_CHAT_MESSAGES + 1 }, (_, index) => ({
          id: String(index),
          role: index === MAX_CHAT_MESSAGES ? 'user' : 'assistant',
          parts: [{ type: 'text', text: 'Hallo' }],
        })),
      }),
      null,
    );
  });
});
