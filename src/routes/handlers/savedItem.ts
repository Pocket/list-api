import { Request, Response } from 'express';

export class SavedItemRequestHandler {
  public enqueueSavedItemsForDeletion(req: Request, res: Response) {
    return res.json({
      status: 'OK',
    });
  }
}
