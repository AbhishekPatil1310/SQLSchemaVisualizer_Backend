import type { DatabaseType, SchemaContext } from './types/ai.types.js';

export class PromptBuilder {
  /**
   * Build prompt for natural language to SQL generation.
   */
  buildQueryGenerationPrompt(
    userQuery: string,
    schemaContext: SchemaContext,
    databaseType: DatabaseType
  ): string {
    const schemaDescription = this.formatSchemaForPrompt(schemaContext);
    const dbHints = this.getDatabaseSpecificHints(databaseType);

    return `You are an expert ${databaseType} SQL assistant.
Generate a safe, performant SQL query for the user request.

SCHEMA:
${schemaDescription}

DATABASE TYPE: ${databaseType}
${dbHints}

USER REQUEST:
${userQuery}

SAFETY & QUALITY RULES:
1. Return valid ${databaseType} SQL only.
2. Prefer explicit columns over SELECT *.
3. Avoid destructive statements unless explicitly requested.
4. For UPDATE/DELETE, always include WHERE safeguards.
5. Use clear aliases for joined tables.
6. Add LIMIT for broad reads unless user explicitly asks for all rows.
7. Add performance-minded suggestions where useful.

Respond as JSON only:
{
  "query": "SQL query string",
  "explanation": "Short explanation",
  "queryType": "SELECT|INSERT|UPDATE|DELETE|JOIN|AGGREGATE",
  "confidence": 0.0,
  "executionTips": ["tip 1", "tip 2"]
}
Do not wrap SQL in markdown blocks.`;
  }

  /**
   * Build prompt for query validation and optimization hints.
   */
  buildValidationPrompt(
    query: string,
    databaseType: DatabaseType,
    schemaContext: SchemaContext
  ): string {
    const schemaDescription = this.formatSchemaForPrompt(schemaContext);
    return `You are a ${databaseType} SQL performance and safety reviewer.

QUERY:
${query}

SCHEMA:
${schemaDescription}

Check:
1. Correctness against schema references
2. Security concerns and dangerous operations
3. Performance risks and index opportunities
4. Estimated impact

Respond as JSON only:
{
  "estimatedExecutionTime": "< 100ms",
  "affectedRows": 0,
  "indexes": ["CREATE INDEX ..."]
}`;
  }

  /**
   * Build prompt for concise schema summary generation.
   */
  buildSchemaSummaryPrompt(schemaContext: SchemaContext): string {
    const schemaDescription = this.formatSchemaForPrompt(schemaContext);
    return `Summarize this database schema in 3-4 concise sentences for an AI SQL assistant.
Focus on core entities, key relationships, and notable constraints.

${schemaDescription}`;
  }

  /**
   * Convert schema context into compact, readable text for prompts.
   */
  private formatSchemaForPrompt(schemaContext: SchemaContext): string {
    const tableBlocks = schemaContext.tables.map((table) => {
      const columnLines = table.columns.map((column) => {
        const tags: string[] = [];
        if (!column.isNullable) tags.push('NOT NULL');
        if (column.isUnique) tags.push('UNIQUE');
        if (column.isForeignKey && column.foreignKeyReference) tags.push(`FK->${column.foreignKeyReference}`);
        return `- ${column.columnName} (${column.dataType})${tags.length ? ` [${tags.join(', ')}]` : ''}`;
      });

      const pkLine = table.primaryKey?.length ? `Primary Key: ${table.primaryKey.join(', ')}` : 'Primary Key: (none)';
      const rowLine = typeof table.rowCount === 'number' ? `Approx Rows: ${table.rowCount}` : 'Approx Rows: unknown';

      return `Table: ${table.tableName}
${columnLines.join('\n')}
${pkLine}
${rowLine}`;
    });

    const relationshipLines = schemaContext.relationships.length
      ? schemaContext.relationships.map(
          (rel) => `${rel.fromTable}.${rel.fromColumn} -> ${rel.toTable}.${rel.toColumn} (${rel.type})`
        )
      : ['(none)'];

    return `${tableBlocks.join('\n\n')}

Relationships:
${relationshipLines.join('\n')}`;
  }

  /**
   * Return concise SQL-engine specific hints.
   */
  private getDatabaseSpecificHints(databaseType: DatabaseType): string {
    if (databaseType === 'postgres') {
      return `POSTGRES HINTS:
- Use RETURNING when useful for DML feedback.
- Prefer CTEs/window functions for complex analytics.
- Be explicit with casts when ambiguity may exist.`;
    }

    if (databaseType === 'mysql') {
      return `MYSQL HINTS:
- Assume MySQL 8+ syntax.
- Prefer indexed predicates for joins/filters.
- Avoid unnecessary subqueries when joins are clearer.`;
    }

    const _exhaustive: never = databaseType;
    return _exhaustive;
  }
}

