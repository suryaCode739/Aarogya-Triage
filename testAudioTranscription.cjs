const fs = require('fs');

async function testTranscription(filename) {
  const base64Audio = fs.readFileSync(filename).toString('base64');
  console.log(`\nTesting transcription for ${filename}...`);
  
  try {
    const res = await fetch('http://localhost:3000/api/transcribe-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: base64Audio,
        audioMime: 'audio/mp3',
        language: 'en'
      })
    });
    
    const data = await res.json();
    console.log('Result:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Test failed:', err);
  }
}

async function run() {
  await testTranscription('test_en.mp3');
  await testTranscription('test_hi.mp3');
}

run();
