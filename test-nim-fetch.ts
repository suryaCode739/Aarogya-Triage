import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiKey = process.env.NIM_API_KEY || process.env.NVIDIA_API_KEY;
  const url = "https://integrate.api.nvidia.com/v1/audio/transcriptions";
  
  const formData = new FormData();
  // We need to attach a file. Since fetch FormData in node is a bit tricky, let's use undici or just use node's native fetch.
  // We can create a Blob.
  const base64Audio = 'UklGRuQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YcAAAAA=';
  const buffer = Buffer.from(base64Audio, 'base64');
  const blob = new Blob([buffer], { type: 'audio/wav' });
  formData.append('file', blob, 'audio.wav');
  formData.append('model', 'openai/whisper-large-v3');

  console.log('Sending request to', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${apiKey}`
    },
    body: formData
  });

  console.log('Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Body:', text);
}
run();
