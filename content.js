// --- CONFIG ---
const MODEL_HIERARCHY = [
    'gemini-2.5-pro',
    'gemini-2.5-flash'
];

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const HOTKEY_CODE = 'KeyS';     
const USE_ALT_KEY = true;       

console.log(`%c🚀 AI Helper: MIME FIX + AGGRESSIVE UNLOCKER`, "color: #fff; background: #d32f2f; padding: 5px; font-weight: bold;");

// --- UI ---
let statusIndicator = null;
function showStatus(msg, color = '#666') {
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.style.cssText = `
            position: fixed; bottom: 10px; right: 10px;
            font-family: monospace; font-size: 11px;
            color: #333; background: rgba(255,255,255,0.95);
            padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;
            pointer-events: none; z-index: 99999; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(statusIndicator);
    }
    statusIndicator.innerText = msg;
    statusIndicator.style.color = color;
    statusIndicator.style.display = 'block';
}
function hideStatus() { if (statusIndicator) setTimeout(() => { statusIndicator.style.display = 'none'; }, 4000); }

// --- AGGRESSIVE UNLOCKER ---
function unlockSite() {
    // 1. CSS Force
    const style = document.createElement('style');
    style.innerHTML = ' * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; pointer-events: auto !important; } ';
    if(!document.getElementById('ai-unlock-style')) {
        style.id = 'ai-unlock-style';
        document.head.appendChild(style);
    }

    // 2. Kill Event Listeners (Capture Phase)
    const events = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup', 'keydown', 'keyup', 'dragstart'];
    events.forEach(evt => {
        window.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
        document.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
    });

    // 3. Loop Cleaner (Для Angular, который может восстанавливать защиту)
    setInterval(() => {
        const targets = [document, document.body, window];
        const props = ['oncontextmenu', 'onselectstart', 'oncopy', 'oncut', 'onpaste', 'onkeydown', 'onkeyup'];
        
        targets.forEach(t => {
            if(!t) return;
            props.forEach(p => {
                if (t[p] !== null) t[p] = null;
            });
        });
    }, 1000);
}

// --- IMAGE HELPER (FIXED MIME TYPES) ---
async function processImageSource(url) {
  try {
    if (!url) return null;

    // Base64
    if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        if (commaIdx === -1) return null;
        const meta = url.substring(0, commaIdx);
        let mimeType = (meta.match(/data:([^;]+);/) || [])[1];
        // Фикс: если mime не определился, ставим jpeg
        if (!mimeType) mimeType = 'image/jpeg';
        return { inline_data: { mime_type: mimeType, data: url.substring(commaIdx + 1) } };
    }

    // URL (Localhost / Web)
    const response = await fetch(url);
    if (!response.ok) throw new Error('Img Fetch Error');
    const blob = await response.blob();
    
    // --- MIME TYPE FIX ---
    // Сервер может вернуть 'application/octet-stream', что ломает Gemini.
    // Мы принудительно определяем тип.
    let mimeType = blob.type;
    
    if (!mimeType || mimeType === 'application/octet-stream') {
        if (url.toLowerCase().endsWith('.png')) mimeType = 'image/png';
        else if (url.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
        else mimeType = 'image/jpeg'; // Дефолт для большинства фото
    }
    // ---------------------

    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    
    const resBase64 = base64Data.split(',')[1];

    return {
      inline_data: {
        mime_type: mimeType,
        data: resBase64
      }
    };
  } catch (e) { 
      console.error('Image Error:', e);
      return null; 
  }
}

// --- PARSER ---
function extractQuestions() {
    const questions = [];
    
    // Поиск текста вопроса (Platonus / Univer)
    const questionWrapper = document.querySelector('.question-wrapper, div[ng-bind-html="question.questionText"], .text');
    if (!questionWrapper) return []; 

    const text = questionWrapper.innerText.trim();
    
    // Поиск картинок
    const qImages = [];
    questionWrapper.querySelectorAll('img').forEach(img => { if (img.src) qImages.push(img.src); });

    const answers = [];
    // Селектор для Platonus + Univer
    const answerRows = document.querySelectorAll('.table-question tbody tr, table.answer tr');
    
    answerRows.forEach((row, idx) => {
        const letterId = String.fromCharCode(65 + idx); // A, B, C...
        const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
        
        // Ищем текст ответа
        // В Platonus текст во 2-й ячейке, в Univer класс .text
        let textContainer = row.querySelector('.text') || (row.querySelectorAll('td').length > 1 ? row.querySelectorAll('td')[1] : row);
        
        if (input && textContainer) {
             let ansText = textContainer.innerText.trim();
             let ansImgSrc = null;
             const img = textContainer.querySelector('img');
             if (img) ansImgSrc = img.src;

             answers.push({
                 id: letterId,
                 text: ansText,
                 imgSrc: ansImgSrc,
                 element: input 
             });
        }
    });

    const isMulti = document.querySelector('input[type="checkbox"]') !== null;
    
    if (answers.length > 0) {
        questions.push({
            number: 1, 
            text: text, 
            images: qImages, 
            answers: answers, 
            isMultiSelect: isMulti
        });
    }
    
    return questions;
}

// --- API CLIENT ---
async function askGemini(question, apiKey) {
  const parts = [];
  
  // 1. Картинки
  if (question.images.length) {
    for (const url of question.images) {
        const p = await processImageSource(url);
        if(p) parts.push(p);
    }
  }

  // 2. Варианты
  let optionsText = "";
  for (const ans of question.answers) {
      let line = `${ans.id}. ${ans.text}`;
      if (ans.imgSrc) {
          const p = await processImageSource(ans.imgSrc);
          if (p) { 
              parts.push(p); 
              line += ` [Image Attached]`; 
          }
      }
      optionsText += line + "\n";
  }

  const promptText = `
Question: ${question.text}
Type: ${question.isMultiSelect ? 'Multi-choice' : 'Single-choice'}
Options:
${optionsText}

Return JSON ONLY: {"correct": ["A"]}
`;
  parts.unshift({ text: promptText });

  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
  };

  // LOGS
  console.group(`❓ ВОПРОС`);
  console.log(`%c📝 PROMPT:`, 'color: #2196F3;', promptText);
  const imgs = requestBody.contents[0].parts.filter(p => p.inline_data);
  if (imgs.length) {
      console.log(`📸 Картинки в запросе: ${imgs.length} шт.`);
      const url = `data:${imgs[0].inline_data.mime_type};base64,${imgs[0].inline_data.data}`;
      console.log('%c ', `font-size: 1px; padding: 50px; background: url('${url}') no-repeat center/contain;`);
      console.log(`MIME sent: ${imgs[0].inline_data.mime_type}`); // Проверяем, какой тип уходит
  }

  for (const model of MODEL_HIERARCHY) {
      try {
        console.log(`📡 Sending to: ${model}`);
        const response = await fetch(`${BASE_URL}${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (response.status === 429 || response.status === 503) {
            console.warn(`⚠️ ${model} Busy/Limit. Next...`);
            continue; 
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error: ${errText}`);
        }

        const data = await response.json();
        const result = JSON.parse(data.candidates[0].content.parts[0].text);
        
        console.log(`%c✅ Result:`, 'color: green', result);
        console.groupEnd();
        showStatus(`Done`, '#2e7d32');
        return result;

      } catch (e) {
          console.error(`❌ Error ${model}:`, e);
      }
  }
  console.groupEnd();
  return null;
}

// --- SOLVER ---
async function solveAll() {
  const storage = await chrome.storage.sync.get(['geminiApiKey']);
  if (!storage.geminiApiKey) return alert('No API Key');

  const questions = extractQuestions();
  if (!questions.length) return console.log('No questions found');

  showStatus('Thinking...');
  
  for (let i = 0; i < questions.length; i++) {
    try {
        const result = await askGemini(questions[i], storage.geminiApiKey);
        if (result && result.correct) {
            questions[i].answers.forEach(ans => {
                if (result.correct.includes(ans.id)) {
                    if (!ans.element.checked) {
                        console.log(`Clicking: ${ans.id}`);
                        ans.element.click();
                    }
                }
            });
        }
    } catch (e) {
        console.error(e);
        showStatus('Error', 'red');
    }
  }
  hideStatus();
}

// --- INIT ---
function init() {
    unlockSite();
    window.addEventListener('keydown', async (e) => {
        if (e.altKey === USE_ALT_KEY && (e.code === HOTKEY_CODE || e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы')) {
            e.preventDefault(); e.stopPropagation();
            await solveAll();
        }
    }, true);
    
    window.addEventListener('click', async (e) => {
        if (e.altKey) {
             e.preventDefault(); e.stopPropagation();
             await solveAll();
        }
    }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
