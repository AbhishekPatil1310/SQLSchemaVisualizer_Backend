import type { DatabaseType, SchemaContext, ValidateQueryResponse } from './types/ai.types.js';

export class QueryValidator {
  /**
   * Validate SQL query against syntax, schema, safety, and performance rules.
   */
  async validateQuery(
    query: string,
    databaseType: DatabaseType,
    schemaContext: SchemaContext
  ): Promise<ValidateQueryResponse> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestedIndexes: string[] = [];

    this.checkBasicSyntax(query, databaseType, errors, warnings);
    this.validateAgainstSchema(query, schemaContext, errors, warnings);
    this.checkSecurityIssues(query, errors, warnings);
    this.checkDangerousOperations(query, warnings);
    this.analyzePerformance(query, schemaContext, suggestedIndexes, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestedIndexes: suggestedIndexes.length ? suggestedIndexes : undefined,
      indexes: suggestedIndexes.length ? suggestedIndexes : undefined
    };
  }

  /**
   * Check basic SQL syntax shape and guardrails.
   */
  checkBasicSyntax(
    query: string,
    _databaseType: DatabaseType,
    errors: string[],
    warnings: string[]
  ): void {
    const trimmed = query.trim();
    if (!trimmed) {
      errors.push('Query cannot be empty');
      return;
    }

    const openParens = (query.match(/\(/g) || []).length;
    const closeParens = (query.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
    }

    const semicolonCount = (query.match(/;/g) || []).length;
    if (semicolonCount > 1) {
      errors.push('Multiple statements are not allowed');
    } else if (trimmed.endsWith(';')) {
      warnings.push('Trailing semicolon detected; submit a single statement without separators');
    }

    const upper = trimmed.toUpperCase();
    const validStarts = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH', 'CREATE', 'ALTER'];
    if (!validStarts.some((keyword) => upper.startsWith(keyword))) {
      errors.push('Unsupported or invalid SQL statement type');
    }
  }

  /**
   * Validate table and column references against current schema.
   */
  validateAgainstSchema(
    query: string,
    schemaContext: SchemaContext,
    errors: string[],
    warnings: string[]
  ): void {
    const tableNames = new Set(schemaContext.tables.map((table) => table.tableName.toLowerCase()));
    const tableRefs = query.match(/(?:FROM|JOIN|INTO|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi) || [];

    for (const ref of tableRefs) {
      const table = ref.split(/\s+/)[1]?.toLowerCase();
      if (table && !tableNames.has(table)) {
        errors.push(`Table '${table}' does not exist in schema`);
      }
    }

    const qualifiedColumnRefs = query.match(/[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    for (const qualifiedRef of qualifiedColumnRefs) {
      const [table, column] = qualifiedRef.split('.');
      if (!this.columnExists(table, column, schemaContext)) {
        warnings.push(`Column reference '${qualifiedRef}' could not be confirmed`);
      }
    }
  }

  /**
   * Check for common SQL injection and abuse patterns.
   */
  checkSecurityIssues(query: string, _errors: string[], warnings: string[]): void {
    const suspiciousPatterns: RegExp[] = [
      /(?:'|")\s*;\s*DROP\s+TABLE/gi,
      /\bUNION\s+SELECT\b/gi,
      /\bOR\s+1\s*=\s*1\b/gi,
      /\bxp_cmdshell\b/gi,
      /\bEXEC\s*\(/gi
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(query)) {
        warnings.push('Potential SQL injection pattern detected');
        break;
      }
    }

    if (query.includes('--') || query.includes('/*')) {
      warnings.push('Query contains comments; review for hidden logic');
    }
  }

  /**
   * Detect destructive operations and missing safety filters.
   */
  checkDangerousOperations(query: string, warnings: string[]): void {
    const upper = query.toUpperCase();

    if (/DELETE\s+FROM\s+[a-zA-Z_][a-zA-Z0-9_]*/i.test(query) && !/\bWHERE\b/i.test(query)) {
      warnings.push('DELETE without WHERE will affect all rows');
    }

    if (/UPDATE\s+[a-zA-Z_][a-zA-Z0-9_]*/i.test(query) && !/\bWHERE\b/i.test(query)) {
      warnings.push('UPDATE without WHERE will affect all rows');
    }

    if (upper.includes('DROP ')) {
      warnings.push('DROP detected; this operation is destructive');
    }

    if (upper.includes('TRUNCATE ')) {
      warnings.push('TRUNCATE detected; this operation removes all table rows');
    }
  }

  /**
   * Provide basic performance warnings and index suggestions.
   */
  analyzePerformance(
    query: string,
    schemaContext: SchemaContext,
    suggestedIndexes: string[],
    warnings: string[]
  ): void {
    if (/SELECT\s+\*/i.test(query)) {
      warnings.push('SELECT * detected; prefer explicit columns for better performance');
    }

    if (/JOIN\s+[a-zA-Z_][a-zA-Z0-9_]*(?![\s\S]*\bON\b)/i.test(query)) {
      warnings.push('JOIN may be missing an ON clause, risking cartesian products');
    }

    if (/\bCROSS\s+JOIN\b/i.test(query)) {
      warnings.push('CROSS JOIN detected; verify cartesian product is intended');
    }

    const whereEqMatches = query.match(/\bWHERE\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*=/gi) || [];
    for (const match of whereEqMatches) {
      const columnRef = match.replace(/\bWHERE\s+/i, '').replace(/\s*=$/, '').trim();
      const [tableName, columnName] = columnRef.includes('.') ? columnRef.split('.') : [null, columnRef];

      if (!tableName || !columnName) {
        continue;
      }

      if (!this.hasIndex(tableName, columnName, schemaContext)) {
        suggestedIndexes.push(`CREATE INDEX idx_${tableName}_${columnName} ON ${tableName}(${columnName});`);
      }
    }
  }

  private columnExists(tableName: string, columnName: string, schemaContext: SchemaContext): boolean {
    const table = schemaContext.tables.find((item) => item.tableName.toLowerCase() === tableName.toLowerCase());
    if (!table) return false;
    return table.columns.some((column) => column.columnName.toLowerCase() === columnName.toLowerCase());
  }

  private hasIndex(tableName: string, columnName: string, schemaContext: SchemaContext): boolean {
    const table = schemaContext.tables.find((item) => item.tableName.toLowerCase() === tableName.toLowerCase());
    if (!table?.indexes?.length) return false;
    return table.indexes.some((index) =>
      index.columns.some((indexedColumn) => indexedColumn.toLowerCase() === columnName.toLowerCase())
    );
  }
}

