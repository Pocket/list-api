import { Router } from 'express';
import { SavedItemRequestHandler } from './handlers/savedItem';

const router = Router();
const savedItemHandler = new SavedItemRequestHandler();

router.post('/queue-deletion', savedItemHandler.enqueueSavedItemsForDeletion);

export const savedItemRouter = router;
