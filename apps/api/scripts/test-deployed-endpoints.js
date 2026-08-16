const https = require('https');

const BASE_URL = process.argv[2] || 'https://c2zshpgj0e.execute-api.ap-south-1.amazonaws.com';

console.log(`\n========================================`);
console.log(`Testing Deployed AWS Lambda API`);
console.log(`Target: ${BASE_URL}`);
console.log(`========================================\n`);

function request(path, options = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const req = https.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
          });
        });
      },
    );

    req.on('error', (err) => {
      resolve({
        statusCode: 0,
        headers: {},
        body: err.message,
      });
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  const tests = [
    {
      name: '1. Public Health Check',
      path: '/api/health',
      method: 'GET',
      expectedStatus: [200],
    },
    {
      name: '2. Database Health Check (CognoDB / Neo4j)',
      path: '/api/health/database',
      method: 'GET',
      expectedStatus: [200],
    },
    {
      name: '3. GitHub OAuth Login Redirect',
      path: '/api/auth/github/login',
      method: 'GET',
      expectedStatus: [302, 307],
    },
    {
      name: '4. Auth Session Guard (Unauthenticated)',
      path: '/api/auth/session',
      method: 'GET',
      expectedStatus: [401],
    },
    {
      name: '5. Repository Tree Guard (Protected)',
      path: '/api/repository/tree',
      method: 'GET',
      expectedStatus: [401],
    },
    {
      name: '6. Graph Overview Guard (Protected)',
      path: '/api/graph/overview',
      method: 'GET',
      expectedStatus: [401],
    },
    {
      name: '7. Impact Simulation Guard (Protected)',
      path: '/api/impact/simulate',
      method: 'POST',
      body: { targetNodeId: 'test' },
      headers: { 'Content-Type': 'application/json' },
      expectedStatus: [401],
    },
    {
      name: '8. AI Intelligence Guard (Protected)',
      path: '/api/intelligence/query',
      method: 'POST',
      body: { query: 'test' },
      headers: { 'Content-Type': 'application/json' },
      expectedStatus: [401],
    },
  ];

  let passed = 0;
  for (const test of tests) {
    process.stdout.write(`Testing ${test.name.padEnd(45)} `);
    const res = await request(test.path, {
      method: test.method,
      headers: test.headers,
      body: test.body,
    });

    const isMatch = test.expectedStatus.includes(res.statusCode);
    if (isMatch) {
      console.log(`\x1b[32m[PASS]\x1b[0m (HTTP ${res.statusCode})`);
      passed++;
    } else {
      console.log(`\x1b[31m[FAIL]\x1b[0m (Got HTTP ${res.statusCode}, expected ${test.expectedStatus.join('/')})`);
      console.log(`   Response: ${res.body.slice(0, 200)}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Summary: ${passed}/${tests.length} Endpoints Working Correctly`);
  console.log(`========================================\n`);
}

runTests();
