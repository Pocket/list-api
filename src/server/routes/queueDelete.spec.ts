import request from 'supertest';
import express from 'express';
import queueDeleteRouter from '../../server/routes/queueDelete';

describe('batchDelete Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/', queueDeleteRouter);

  it('Successfully makes request to queue items for user', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send();
    expect(res.status).toBe(200);
  });
});
