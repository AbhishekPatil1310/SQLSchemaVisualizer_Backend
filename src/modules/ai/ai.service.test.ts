import test from 'node:test';
import assert from 'node:assert/strict';
import type { SchemaContext } from './types/ai.types.js';

const schemaContext: SchemaContext = {
  databaseType: 'postgres',
  cachedAt: new Date(),
  tables: [
    {
      tableName: 'users',
      columns: [
        { columnName: 'id', dataType: 'uuid', isNullable: false, isUnique: true },
        { columnName: 'email', dataType: 'text', isNullable: false, isUnique: true }
      ],
      primaryKey: ['id'],
      indexes: [{ indexName: 'idx_users_email', columns: ['email'], isUnique: true }]
    }
  ],
  relationships: []
};

test('generateQuery returns valid structure and caches responses', async () => {
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-key';
  const { AIService } = await import('./ai.service.js');

  let calls = 0;
  const model = {
    generateContent: async () => {
      calls += 1;
      return {
        response: {
          text: () =>
            '```json\n{"query":"SELECT id, email FROM users LIMIT 10","explanation":"Select top rows","queryType":"SELECT","confidence":0.9,"executionTips":["Use index on email"]}\n```'
        }
      };
    }
  };

  const service = new AIService({ model });
  const first = await service.generateQuery(
    'user-1',
    { naturalLanguageQuery: 'list users', databaseType: 'postgres' },
    schemaContext
  );
  const second = await service.generateQuery(
    'user-1',
    { naturalLanguageQuery: 'list users', databaseType: 'postgres' },
    schemaContext
  );

  assert.equal(first.queryType, 'SELECT');
  assert.equal(second.query, first.query);
  assert.equal(calls, 1);
});

test('generateQuery throws on empty schema context', async () => {
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-key';
  const { AIService } = await import('./ai.service.js');

  const model = {
    generateContent: async () => ({
      response: { text: () => '{"query":"SELECT 1","explanation":"ok","queryType":"SELECT","confidence":1}' }
    })
  };

  const service = new AIService({ model });
  await assert.rejects(
    service.generateQuery(
      'user-1',
      { naturalLanguageQuery: 'anything', databaseType: 'postgres' },
      { ...schemaContext, tables: [] }
    )
  );
});

test('generateQuery surfaces Gemini failures', async () => {
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-key';
  const { AIService } = await import('./ai.service.js');

  const model = {
    generateContent: async () => {
      throw new Error('Gemini unavailable');
    }
  };
  const service = new AIService({ model });

  await assert.rejects(
    service.generateQuery(
      'user-1',
      { naturalLanguageQuery: 'list users', databaseType: 'postgres' },
      schemaContext
    )
  );
});

test('parse response handles markdown blocks and invalid JSON', async () => {
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-key';
  const { AIService } = await import('./ai.service.js');

  const okModel = {
    generateContent: async () => ({
      response: {
        text: () =>
          '```json\n{"query":"SELECT email FROM users","explanation":"ok","queryType":"SELECT","confidence":0.8}\n```'
      }
    })
  };
  const okService = new AIService({ model: okModel });
  const ok = await okService.generateQuery(
    'user-2',
    { naturalLanguageQuery: 'emails', databaseType: 'postgres' },
    schemaContext
  );
  assert.match(ok.query, /SELECT email/);

  const badModel = {
    generateContent: async () => ({
      response: {
        text: () => '```json\n{"query": "SELECT id FROM users",\n```'
      }
    })
  };
  const badService = new AIService({ model: badModel });
  await assert.rejects(
    badService.generateQuery(
      'user-3',
      { naturalLanguageQuery: 'bad', databaseType: 'postgres' },
      schemaContext
    )
  );
});
