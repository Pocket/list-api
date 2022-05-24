import request from 'supertest';
import express from 'express';
import batchDeleteRouter from '../../server/routes/batchDelete';

describe('batchDelete Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/', batchDeleteRouter);
  it('Successfully makes request to remove one itemId for user', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({ userId: 123, itemIds: [1] });
    expect(res.status).toBe(200);
    expect(res.text).toBe('Deleting 1 itemId(s) for userId=123');
  });
  it('Successfully makes request to remove > 1 itemId for user', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({ userId: 123, itemIds: [1, 2, 3, 4] });
    expect(res.status).toBe(200);
    expect(res.text).toBe('Deleting 4 itemId(s) for userId=123');
  });
  it('Rejects request without userId', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({itemIds: [1, 2, 3, 4] });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].param).toEqual('userId');
  });
  it('Rejects request with invalid userId', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({userId: 'notanid', itemIds: [1, 2, 3, 4] });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].param).toEqual('userId');
  });
  it('Rejects request without itemIds', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({userId: 1});
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].param).toEqual('itemIds');
  });
  it('Rejects request with empty itemIds', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({userId: 1, itemIds: []});
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].param).toEqual('itemIds');
  });
  it('Rejects request with an invalid itemId', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({userId: 1, itemIds: [1, 'notanid', 2]});
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].param).toEqual('itemIds');
  });
  it('Rejects request with an > 1000 itemIds', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({userId: 1, itemIds: [...Array(10001).keys()]});
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].param).toEqual('itemIds');
  });
});
