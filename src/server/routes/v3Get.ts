import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();
router.post('/', async (req, res) => {
  console.log(`req :` + JSON.stringify(req.body));
  //const response = await graphQLCallForGet(req);
  res.status(200).send(JSON.stringify('bla'));
});

export async function graphQLCallForGet(req: any) {
  try {
    const query = `
query Query {
  user {
    savedItems {
      edges {
        node {
          id
          url
        }
        cursor
      }
      pageInfo {
        endCursor
        hasNextPage
        hasPreviousPage
        startCursor
      }
      totalCount
    }
  }
}
  `;

    console.log('going to call graph QL . . .');
    const variables = {};

    const headers = {};
    for (const headerKey of [
      'cookie',
      'content-type',
      //'accept',
      //'cache-control',
      //'postman-token',
      // 'host',
      //'connection',
      //'content-length'
    ]) {
      headers[headerKey] = req.headers[headerKey];
    }
    const res = await fetch(
      `https://getpocket.com/graphql?consumer_key=${req.body['consumer_key']}&access_token=${req.body['access_token']}`,
      {
        method: 'post',
        headers: headers,
        body: JSON.stringify({ query: query, variables }),
      }
    );

    return await res.json();
  } catch (e) {
    console.log(`exception` + e.message);
    return null;
  }
}

export default router;
