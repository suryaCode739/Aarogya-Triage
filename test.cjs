const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/NIM_API_KEY="?(.*?)"?(?:\n|$)/)[1].trim();

async function test() {
  const models = ['meta/llama-3.1-8b-instruct', 'google/gemma-2b', 'ibm/granite-3.0-8b-instruct', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'];
  for (const m of models) {
    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
      body: JSON.stringify({model: m, messages: [{role: 'user', content: 'hello'}]})
    });
    console.log(m, r.status);
    if (r.status === 200) {
      console.log(await r.json());
    } else {
      console.log(await r.text());
    }
  }
}
test();
