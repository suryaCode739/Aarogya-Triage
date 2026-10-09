const fs = require('fs');

async function generateSyntheticAudio(text, lang, filename) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(filename, Buffer.from(buffer));
  console.log('Generated', filename);
}

generateSyntheticAudio('I have had a severe headache and fever for two days.', 'en', 'test_en.mp3');
generateSyntheticAudio('Mera sardi aur khasi bohot zyada hai.', 'hi', 'test_hi.mp3');
