import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { createNote, deleteNote, listNotes, updateNote } from './notes.controller.js';

const router = Router();

router.get('/:connectionId', authenticate, listNotes);
router.post('/:connectionId', authenticate, createNote);
router.put('/:noteId', authenticate, updateNote);
router.delete('/:noteId', authenticate, deleteNote);

export default router;
