const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/NIM_API_KEY="?(.*?)"?(?:\n|$)/)[1].trim();

async function test() {
  const models = ['meta/llama3-8b-instruct', 'meta/llama-3.1-8b-instruct', 'meta/llama-3.1-70b-instruct', 'meta/llama3-70b-instruct', 'mistralai/mistral-7b-instruct-v0.3'];
  for (const m of models) {
    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
      body: JSON.stringify({model: m, messages: [{role: 'user', content: 'hello'}]})
    });
    if (r.status === 200) console.log('WORKED:', m);
    else console.log('FAILED:', m, r.status);
  }
}
test();
