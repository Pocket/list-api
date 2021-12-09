import app from './server/main';

app.listen({ port: 4005 }, () => {
  console.log(`🚀 Public server ready at http://localhost:4005`);
});
