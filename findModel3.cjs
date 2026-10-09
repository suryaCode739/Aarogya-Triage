const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const key = env.match(/NIM_API_KEY="?(.*?)"?(?:\n|$)/)[1].trim();

async function findWorkingModel() {
  const r = await fetch('https://integrate.api.nvidia.com/v1/models', { headers: {Authorization: 'Bearer ' + key}});
  const data = await r.json();
  const allModels = data.data.map(m => m.id);
  
  for (const m of allModels) {
    if (m.includes('vision') || m.includes('audio') || m.includes('guard')) continue;
    
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
      body: JSON.stringify({model: m, messages: [{role: 'user', content: 'test'}]})
    });
    if (res.status === 200) {
      console.log('WORKING:', m);
    }
  }
}
findWorkingModel();
