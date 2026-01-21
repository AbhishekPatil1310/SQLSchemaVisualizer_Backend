import { queryMetadata } from '../../config/database.js';

export const getActiveConnectionForUser = async (userId: string) => {
  const res = await queryMetadata(
    'SELECT encrypted_url FROM user_connections WHERE user_id = $1 AND is_active = true LIMIT 1',
    [userId]
  );
  
  if (res.rows.length === 0) {
    throw new Error('No active database connection found. Please select or add one.');
  }
  
  return res.rows[0].encrypted_url;
};