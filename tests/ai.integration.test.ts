import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { QueryValidator } from '../src/modules/ai/query-validator.js';
import type { SchemaContext } from '../src/modules/ai/types/ai.types.js';
import { authenticate } from '../src/middleware/auth.middleware.js';

const schemaContext: SchemaContext = {
  databaseType: 'postgres',
  cachedAt: new Date(),
  tables: [
    {
      tableName: 'students',
      columns: [
        { columnName: 'id', dataType: 'uuid', isNullable: false },
        { columnName: 'name', dataType: 'text', isNullable: false }
      ],
      primaryKey: ['id']
    }
  ],
  relationships: []
};

test('full flow: natural language -> SQL -> validation using mocked Gemini', async () => {
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-key';
  const { AIService } = await import('../src/modules/ai/ai.service.js');

  const model = {
    generateContent: async ({ contents }: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
      const prompt = contents[0]?.parts[0]?.text ?? '';
      if (prompt.includes('Respond as JSON only') && prompt.includes('queryType')) {
        return {
          response: {
            text: () =>
              '{"query":"SELECT id, name FROM students LIMIT 10","explanation":"Read sample rows","queryType":"SELECT","confidence":0.9,"executionTips":["Use id index"]}'
          }
        };
      }
      return {
        response: {
          text: () => '{"estimatedExecutionTime":"< 50ms","affectedRows":10,"indexes":["CREATE INDEX idx_students_name ON students(name);"]}'
        }
      };
    }
  };

  const service = new AIService({ model, queryValidator: new QueryValidator() });
  const generated = await service.generateQuery(
    'integration-user',
    { naturalLanguageQuery: 'show students', databaseType: 'postgres' },
    schemaContext
  );
  const validated = await service.validateQuery(
    'integration-user',
    { query: generated.query, databaseType: 'postgres' },
    schemaContext
  );

  assert.match(generated.query, /SELECT id, name FROM students/);
  assert.equal(validated.isValid, true);
});

test('auth middleware rejects missing token and accepts valid token', async () => {
  process.env.JWT_SECRET = 'integration-secret';

  const app = express();
  app.get('/secure', authenticate, (_req, res) => res.status(200).json({ ok: true }));

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const unauthorized = await fetch(`${baseUrl}/secure`);
  assert.equal(unauthorized.status, 401);

  const token = jwt.sign({ userId: 'u-1' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const authorized = await fetch(`${baseUrl}/secure`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(authorized.status, 200);

  server.close();
});

test('rate limiter blocks excess requests', async () => {
  const app = express();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api/ai', limiter);
  app.get('/api/ai/stats', (_req, res) => res.status(200).json({ success: true }));

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const first = await fetch(`${baseUrl}/api/ai/stats`);
  const second = await fetch(`${baseUrl}/api/ai/stats`);

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);

  server.close();
});
