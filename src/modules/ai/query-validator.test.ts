import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryValidator } from './query-validator.js';
import type { SchemaContext } from './types/ai.types.js';

const schemaContext: SchemaContext = {
  databaseType: 'postgres',
  cachedAt: new Date(),
  tables: [
    {
      tableName: 'users',
      columns: [
        { columnName: 'id', dataType: 'uuid', isNullable: false },
        { columnName: 'email', dataType: 'text', isNullable: false }
      ],
      indexes: [{ indexName: 'idx_users_id', columns: ['id'], isUnique: true }],
      primaryKey: ['id']
    },
    {
      tableName: 'orders',
      columns: [
        { columnName: 'id', dataType: 'uuid', isNullable: false },
        { columnName: 'user_id', dataType: 'uuid', isNullable: false, isForeignKey: true, foreignKeyReference: 'users' }
      ],
      primaryKey: ['id']
    }
  ],
  relationships: [
    { fromTable: 'orders', toTable: 'users', fromColumn: 'user_id', toColumn: 'id', type: 'ONE_TO_MANY' }
  ]
};

test('detects dangerous operations', async () => {
  const validator = new QueryValidator();
  const result = await validator.validateQuery('DELETE FROM users', 'postgres', schemaContext);
  assert.equal(result.isValid, true);
  assert.ok(result.warnings.some((warning) => warning.includes('DELETE without WHERE')));
});

test('detects schema issues', async () => {
  const validator = new QueryValidator();
  const result = await validator.validateQuery('SELECT * FROM ghost_table', 'postgres', schemaContext);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((error) => error.includes('ghost_table')));
});

test('detects SQL injection patterns', async () => {
  const validator = new QueryValidator();
  const result = await validator.validateQuery(
    "SELECT * FROM users WHERE email = '' ; DROP TABLE users",
    'postgres',
    schemaContext
  );
  assert.ok(result.warnings.some((warning) => warning.includes('Potential SQL injection pattern')));
});

test('suggests indexes for equality filters', async () => {
  const validator = new QueryValidator();
  const result = await validator.validateQuery(
    'SELECT orders.id FROM orders WHERE orders.user_id = 42',
    'postgres',
    schemaContext
  );
  assert.ok((result.suggestedIndexes ?? []).some((indexSql) => indexSql.includes('orders(user_id)')));
});

