import dotenv from 'dotenv';
dotenv.config();

import { transcribeAudioOnly } from './server/geminiService.js';
import fs from 'fs';

async function run() {
  const base64Audio = 'UklGRuQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YcAAAAA=';
  try {
    const res = await transcribeAudioOnly(base64Audio, 'audio/wav');
    console.log(res);
  } catch (err) {
    console.error(err);
  }
}
run();
