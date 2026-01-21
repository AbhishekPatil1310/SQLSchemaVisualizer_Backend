export interface QueryResult {
  type: 'table' | 'json';
  data?: any[];      // For JSON format
  columns?: string[]; // For Table format
  rows?: any[];       // For Table format
  rowCount?: number | null;
}

export interface AivenConnection {
  id: string;
  label: string;
  isActive: boolean;
}