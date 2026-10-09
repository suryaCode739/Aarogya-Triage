const fs = require('fs');
let content = fs.readFileSync('server/geminiService.ts', 'utf-8');
content = "import { GoogleGenAI } from '@google/genai';\n" + content.replace("import { GoogleGenAI } from '@google/genai';", "");
fs.writeFileSync('server/geminiService.ts', content);
