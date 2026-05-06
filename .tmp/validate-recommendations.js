const http = require('http');

const urls = [
  'http://localhost:3001/api/leagues/1/teams/8/waivers/recommendations',
  'http://localhost:3001/api/leagues/1/teams/8/trades/recommendations',
];

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({ url, status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

(async () => {
  for (const url of urls) {
    const result = await get(url);
    console.log(JSON.stringify(result));
  }
})();
