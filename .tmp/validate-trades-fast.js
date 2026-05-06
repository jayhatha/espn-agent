const http = require('http');

http.get('http://localhost:3001/api/leagues/1/teams/8/trades/recommendations?maxCandidates=1', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(JSON.stringify({ status: res.statusCode, body: data }));
  });
}).on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
