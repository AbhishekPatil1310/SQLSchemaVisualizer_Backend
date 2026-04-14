interface DatabaseDriverError extends Error {
  code?: string;
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
  detail?: string;
}

interface MappedDatabaseError {
  status: number;
  error: string;
  details: string;
  dbCode?: string;
}

const fallback = (error: DatabaseDriverError): MappedDatabaseError => ({
  status: 400,
  error: 'Query Execution Failed',
  details: error.message || 'Database query failed',
  dbCode: error.code
});

export const mapDatabaseError = (rawError: unknown): MappedDatabaseError => {
  const error = rawError as DatabaseDriverError;
  const code = error?.code;
  const message = (error?.message || '').toLowerCase();

  if (!error) {
    return {
      status: 400,
      error: 'Query Execution Failed',
      details: 'Unknown database error'
    };
  }

  // PostgreSQL SQLSTATE codes
  switch (code) {
    case '42P01':
      return {
        status: 400,
        error: 'Table Not Found',
        details: 'The referenced table does not exist in this database.',
        dbCode: code
      };
    case '42703':
      return {
        status: 400,
        error: 'Column Not Found',
        details: 'One or more referenced columns do not exist in the target table.',
        dbCode: code
      };
    case '42601':
      return {
        status: 400,
        error: 'SQL Syntax Error',
        details: error.message,
        dbCode: code
      };
    case '42883':
      return {
        status: 400,
        error: 'Function Not Found',
        details: 'A called SQL function does not exist or has incompatible argument types.',
        dbCode: code
      };
    case '22P02':
      return {
        status: 400,
        error: 'Invalid Input Syntax',
        details: error.message,
        dbCode: code
      };
    case '22001':
      return {
        status: 400,
        error: 'Value Too Long',
        details: 'One of the values exceeds the allowed length for its column.',
        dbCode: code
      };
    case '23505':
      return {
        status: 409,
        error: 'Duplicate Value',
        details: error.detail || 'This operation violates a unique constraint.',
        dbCode: code
      };
    case '23503':
      return {
        status: 409,
        error: 'Foreign Key Violation',
        details: error.detail || 'This operation violates a foreign key constraint.',
        dbCode: code
      };
    case '42501':
      return {
        status: 403,
        error: 'Permission Denied',
        details: 'The database user does not have permission for this operation.',
        dbCode: code
      };
    default:
      break;
  }

  // MySQL driver codes
  switch (code) {
    case 'ER_NO_SUCH_TABLE':
      return {
        status: 400,
        error: 'Table Not Found',
        details: 'The referenced table does not exist in this database.',
        dbCode: code
      };
    case 'ER_BAD_FIELD_ERROR':
      return {
        status: 400,
        error: 'Column Not Found',
        details: 'One or more referenced columns do not exist in the target table.',
        dbCode: code
      };
    case 'ER_PARSE_ERROR':
      return {
        status: 400,
        error: 'SQL Syntax Error',
        details: error.sqlMessage || error.message,
        dbCode: code
      };
    case 'ER_DUP_ENTRY':
      return {
        status: 409,
        error: 'Duplicate Value',
        details: error.sqlMessage || 'This operation violates a unique constraint.',
        dbCode: code
      };
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_ROW_IS_REFERENCED_2':
      return {
        status: 409,
        error: 'Foreign Key Violation',
        details: error.sqlMessage || 'This operation violates a foreign key constraint.',
        dbCode: code
      };
    default:
      break;
  }

  // Fallback phrase-based detection
  if (message.includes('relation') && message.includes('does not exist')) {
    return {
      status: 400,
      error: 'Table Not Found',
      details: error.message,
      dbCode: code
    };
  }

  if (message.includes('column') && message.includes('does not exist')) {
    return {
      status: 400,
      error: 'Column Not Found',
      details: error.message,
      dbCode: code
    };
  }

  if (message.includes('syntax error')) {
    return {
      status: 400,
      error: 'SQL Syntax Error',
      details: error.message,
      dbCode: code
    };
  }

  return fallback(error);
};
