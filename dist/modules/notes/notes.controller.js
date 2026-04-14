import { z } from 'zod';
import { queryMetadata } from '../../config/database.js';
const createNoteSchema = z.object({
    name: z.string().trim().min(1, 'Note name is required').max(255, 'Note name is too long'),
    description: z.string().trim().min(1, 'Note description is required')
});
const updateNoteSchema = z.object({
    name: z.string().trim().min(1, 'Note name is required').max(255, 'Note name is too long'),
    description: z.string().trim().min(1, 'Note description is required')
});
const countWords = (text) => {
    const trimmed = text.trim();
    if (!trimmed)
        return 0;
    return trimmed.split(/\s+/).length;
};
const validateDescriptionWordLimit = (description) => {
    const words = countWords(description);
    if (words > 10000) {
        return `Description exceeds 10000 words (current: ${words})`;
    }
    return null;
};
const userOwnsConnection = async (userId, connectionId) => {
    const connectionRes = await queryMetadata('SELECT id FROM user_connections WHERE id = $1 AND user_id = $2', [connectionId, userId]);
    return (connectionRes.rowCount ?? 0) > 0;
};
export const listNotes = async (req, res) => {
    try {
        const { connectionId } = req.params;
        const userId = req.user?.userId;
        if (!userId || !connectionId) {
            return res.status(400).json({ error: 'User ID or Connection ID missing' });
        }
        const ownsConnection = await userOwnsConnection(userId, connectionId);
        if (!ownsConnection) {
            return res.status(404).json({ error: 'Connection not found or access denied' });
        }
        const notesRes = await queryMetadata(`SELECT id, connection_id, name, description, created_at, updated_at
       FROM notes
       WHERE connection_id = $1
       ORDER BY created_at DESC`, [connectionId]);
        res.json(notesRes.rows ?? []);
    }
    catch (error) {
        console.error('List Notes Error:', error);
        res.status(500).json({ error: 'Failed to fetch notes', details: error.message });
    }
};
export const createNote = async (req, res) => {
    try {
        const { connectionId } = req.params;
        const userId = req.user?.userId;
        if (!userId || !connectionId) {
            return res.status(400).json({ error: 'User ID or Connection ID missing' });
        }
        const ownsConnection = await userOwnsConnection(userId, connectionId);
        if (!ownsConnection) {
            return res.status(404).json({ error: 'Connection not found or access denied' });
        }
        const payload = createNoteSchema.parse(req.body);
        const wordLimitError = validateDescriptionWordLimit(payload.description);
        if (wordLimitError) {
            return res.status(400).json({ error: wordLimitError });
        }
        const countRes = await queryMetadata('SELECT COUNT(*)::int AS count FROM notes WHERE connection_id = $1', [connectionId]);
        if (countRes.rows[0].count >= 10) {
            return res.status(400).json({ error: 'A connection can have at most 10 notes' });
        }
        const insertRes = await queryMetadata(`INSERT INTO notes (connection_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, connection_id, name, description, created_at, updated_at`, [connectionId, payload.name, payload.description]);
        res.status(201).json(insertRes.rows[0]);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0].message });
        }
        console.error('Create Note Error:', error);
        res.status(500).json({ error: 'Failed to create note', details: error.message });
    }
};
export const updateNote = async (req, res) => {
    try {
        const { noteId } = req.params;
        const userId = req.user?.userId;
        if (!userId || !noteId) {
            return res.status(400).json({ error: 'User ID or Note ID missing' });
        }
        const payload = updateNoteSchema.parse(req.body);
        const wordLimitError = validateDescriptionWordLimit(payload.description);
        if (wordLimitError) {
            return res.status(400).json({ error: wordLimitError });
        }
        const updateRes = await queryMetadata(`UPDATE notes AS n
       SET name = $1, description = $2, updated_at = now()
       FROM user_connections AS uc
       WHERE n.id = $3
         AND n.connection_id = uc.id
         AND uc.user_id = $4
       RETURNING n.id, n.connection_id, n.name, n.description, n.created_at, n.updated_at`, [payload.name, payload.description, noteId, userId]);
        if ((updateRes.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: 'Note not found or access denied' });
        }
        res.json(updateRes.rows[0]);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues[0].message });
        }
        console.error('Update Note Error:', error);
        res.status(500).json({ error: 'Failed to update note', details: error.message });
    }
};
export const deleteNote = async (req, res) => {
    try {
        const { noteId } = req.params;
        const userId = req.user?.userId;
        if (!userId || !noteId) {
            return res.status(400).json({ error: 'User ID or Note ID missing' });
        }
        const deleteRes = await queryMetadata(`DELETE FROM notes AS n
       USING user_connections AS uc
       WHERE n.id = $1
         AND n.connection_id = uc.id
         AND uc.user_id = $2
       RETURNING n.id`, [noteId, userId]);
        if ((deleteRes.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: 'Note not found or access denied' });
        }
        res.json({ message: 'Note deleted successfully' });
    }
    catch (error) {
        console.error('Delete Note Error:', error);
        res.status(500).json({ error: 'Failed to delete note', details: error.message });
    }
};
//# sourceMappingURL=notes.controller.js.map