// ============================================================================
// AI STEALTH SOLVER v2.4 (MIME Fix + Aggressive Unlocker)
// ============================================================================

// --- CONFIG ---
// Используем только Flash (быстрая и дешевая)
const MODEL_HIERARCHY = [
    'gemini-3-flash-preview',
    'gemini-2.5-flash'    
];

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const HOTKEY_CODE = 'KeyS';     
const USE_ALT_KEY = true;       
const MARKER_COLOR = '#cccccc';

let currentKeyIndex = 0;

console.log(`%c🚀 AI Solver: MIME FIX APPLIED`, "color: #fff; background: #d32f2f; padding: 5px; font-weight: bold;");

// --- UI HELPERS ---
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

function hideStatus() { 
    if (statusIndicator) setTimeout(() => { statusIndicator.style.display = 'none'; }, 4000); 
}

// --- SUPER AGGRESSIVE UNLOCKER ---
function unlockSite() {
    // 1. Принудительный CSS для выделения (восстанавливаем, если удалят)
    function injectStyle() {
        if(!document.getElementById('ai-unlock-style')) {
            const style = document.createElement('style');
            style.id = 'ai-unlock-style';
            style.innerHTML = ' * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; pointer-events: auto !important; } ';
            document.head.appendChild(style);
        }
    }
    injectStyle();

    // 2. Убиваем слушателей событий в фазе захвата (Capture)
    const events = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup', 'keydown', 'keyup', 'dragstart'];
    events.forEach(evt => {
        window.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
        document.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
    });

    // 3. Циклическая очистка (каждые 500мс)
    // Платонус любит вешать oncopy="return false" прямо в теги body или div.
    setInterval(() => {
        injectStyle(); // Проверяем стиль
        
        const targets = [document, document.body, window];
        const props = ['oncontextmenu', 'onselectstart', 'oncopy', 'oncut', 'onpaste', 'ondragstart'];
        
        targets.forEach(t => {
            if(!t) return;
            props.forEach(p => {
                if (t[p] !== null) t[p] = null; // Обнуляем запреты
            });
        });
    }, 500);
    
    console.log('🔓 Unlocker active (Loop mode)');
}

// --- DATA EXTRACTORS ---
function getPlatformName() {
    try {
        if (document.querySelector('[ng-app="PlatonusApp"]') || document.querySelector('.question-wrapper')) return "Platonus";
        if (document.querySelector('table.question')) return "Univer";
    } catch (e) {}
    return "Unknown";
}

function getStudentName() {
    try {
        const platonusName = document.querySelector('.dropdown-user .fw-semibold, .user-info .name');
        if (platonusName) return platonusName.innerText.trim();

        const univerHeaderRows = document.querySelectorAll('.table-header .row-header');
        for (let row of univerHeaderRows) {
            if (row.innerText.includes('Ф.И.О.') || row.innerText.includes('Student')) {
                const val = row.querySelector('.col-value');
                if (val) return val.innerText.trim();
            }
        }
    } catch (e) {}
    return "Unknown";
}

// --- IMAGE HELPER (FORCE JPEG) ---
async function processImageSource(url) {
  try {
    if (!url) return null;

    // Base64
    if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        if (commaIdx === -1) return null;
        const meta = url.substring(0, commaIdx);
        let mimeType = (meta.match(/data:([^;]+);/) || [])[1];
        if (!mimeType) mimeType = 'image/jpeg';
        return { inline_data: { mime_type: mimeType, data: url.substring(commaIdx + 1) } };
    }

    // Fetch URL
    const response = await fetch(url);
    if (!response.ok) throw new Error('Img Fetch Error');
    const blob = await response.blob();
    
    // === FIX 400 ERROR ===
    // Если сервер отдает application/octet-stream или пустоту,
    // мы нагло врем Gemini, что это JPEG. Обычно это работает, так как байты совпадают.
    let mimeType = blob.type;
    
    if (!mimeType || mimeType === 'application/octet-stream') {
        // Пытаемся угадать по расширению, если нет - ставим jpeg
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.endsWith('.png')) mimeType = 'image/png';
        else if (lowerUrl.endsWith('.webp')) mimeType = 'image/webp';
        else mimeType = 'image/jpeg'; 
    }
    // =====================

    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    
    return { inline_data: { mime_type: mimeType, data: base64Data.split(',')[1] } };
  } catch (e) { 
      console.error('Image Error:', e);
      return null; 
  }
}

// --- PARSERS ---
function parseSingleUniverQuestion(table, index) {
    const textElem = table.querySelector('.text');
    if (!textElem) return null;
    const qImages = [];
    textElem.querySelectorAll('img').forEach(img => { if (img.src) qImages.push(img.src); });
    const answerTable = table.nextElementSibling;
    if (!answerTable || !answerTable.classList.contains('answer')) return null;
    const answers = [];
    answerTable.querySelectorAll('tr').forEach(row => {
      const label = row.querySelector('.num');
      const textDiv = row.querySelector('.text');
      const input = row.querySelector('input');
      if (label && input) {
        let ansText = textDiv ? textDiv.innerText.trim() : '';
        let ansImgSrc = null;
        if (textDiv) { const img = textDiv.querySelector('img'); if (img) ansImgSrc = img.src; }
        answers.push({ id: label.innerText.replace('.', '').trim(), text: ansText, imgSrc: ansImgSrc, element: input });
      }
    });
    return { number: index, text: textElem.innerText.trim(), images: qImages, answers: answers, isMultiSelect: answerTable.dataset.qtype === '2', domElement: table };
}

function extractQuestions() {
    const platonusWrapper = document.querySelector('.question-wrapper, div[ng-bind-html="question.questionText"], .text-color.bold');
    if (platonusWrapper) {
        const text = platonusWrapper.innerText.trim();
        const qImages = [];
        platonusWrapper.querySelectorAll('img').forEach(img => { if (img.src) qImages.push(img.src); });
        const answers = [];
        document.querySelectorAll('.table-question tbody tr, .answer-variant').forEach((row, idx) => {
            const letterId = String.fromCharCode(65 + idx); 
            const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
            const cells = row.querySelectorAll('td');
            let textContainer = cells.length > 1 ? cells[1] : row.querySelector('label');
            if (input && textContainer) {
                 let ansText = textContainer.innerText.trim();
                 let ansImgSrc = null;
                 const img = textContainer.querySelector('img');
                 if (img) ansImgSrc = img.src;
                 answers.push({ id: letterId, text: ansText, imgSrc: ansImgSrc, element: input });
            }
        });
        const isMulti = document.querySelector('input[type="checkbox"]') !== null;
        if (answers.length > 0) return [{ number: 1, text: text, images: qImages, answers: answers, isMultiSelect: isMulti, domElement: platonusWrapper.closest('.card') || platonusWrapper }];
    }
    const univerTables = document.querySelectorAll('table.question');
    if (univerTables.length > 0) {
        const questions = [];
        univerTables.forEach((table, index) => { const q = parseSingleUniverQuestion(table, index + 1); if(q) questions.push(q); });
        return questions;
    }
    return [];
}

// --- API CLIENT ---
async function askGemini(question, apiKeys) {
  const parts = [];
  let imgCount = 0;
  
  if (question.images.length) {
    for (const url of question.images) {
        const p = await processImageSource(url);
        if(p) { parts.push(p); imgCount++; }
    }
  }

  let optionsText = "";
  for (const ans of question.answers) {
      let line = `${ans.id}. ${ans.text}`;
      if (ans.imgSrc) {
          const p = await processImageSource(ans.imgSrc);
          if (p) { parts.push(p); imgCount++; line += ` [Image Attached]`; }
      }
      optionsText += line + "\n";
  }

  const promptText = `
Question: ${question.text}
Type: ${question.isMultiSelect ? 'Multi-choice' : 'Single-choice'}
Options:
${optionsText}

Return JSON ONLY: {"correct": ["A"], "reason": "Short explanation"}
`;
  parts.unshift({ text: promptText });
  
  const requestBody = { contents: [{ parts: parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.0 } };

  // Debug Images
  const imgDebug = requestBody.contents[0].parts.filter(p => p.inline_data);
  if(imgDebug.length > 0) console.log(`📸 Sending ${imgDebug.length} images as ${imgDebug[0].inline_data.mime_type}`);

  for (const model of MODEL_HIERARCHY) {
      for (let i = 0; i < apiKeys.length; i++) {
          const keyIndex = (currentKeyIndex + i) % apiKeys.length;
          const apiKey = apiKeys[keyIndex];

          try {
            console.log(`📡 Sending... Key[${keyIndex}]`);
            const response = await fetch(`${BASE_URL}${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
            });

            if (response.status === 429 || response.status === 503) {
                console.warn(`⚠️ Key[${keyIndex}] Limit. Next...`);
                continue; 
            }

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            const result = JSON.parse(data.candidates[0].content.parts[0].text);
            
            // Stats
            try {
                chrome.runtime.sendMessage({
                    action: 'log_event',
                    type: 'solve_success',
                    model: model,
                    meta: { 
                        student: getStudentName(),
                        platform: getPlatformName(),
                        question: question.text.substring(0, 100),
                        answer_ai: result.correct.join(', '),
                        has_images: imgCount > 0
                    }
                });
            } catch(e){}

            currentKeyIndex = keyIndex;
            showStatus(`Solved`, '#2e7d32');
            return result;

          } catch (e) { console.error(`Err Key[${keyIndex}]:`, e); }
      }
  }
  return null;
}

// --- SOLVER ---
async function processQuestion(q, apiKeys) {
    showStatus(`...`, '#1976d2');
    if(q.domElement) { q.domElement.style.transition = "opacity 0.3s"; q.domElement.style.opacity = '0.7'; }

    try {
        const result = await askGemini(q, apiKeys);
        if(q.domElement) q.domElement.style.opacity = '1';

        if (result && result.correct) {
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id)) {
                    if (!ans.element.checked) ans.element.click();
                    if (ans.textElement && !ans.textElement.innerHTML.includes('&bull;')) {
                        const m = document.createElement('span');
                        m.innerHTML = '&bull;'; m.style.color = MARKER_COLOR; m.style.marginLeft='5px'; m.title = result.reason;
                        ans.textElement.appendChild(m);
                    }
                }
            });
        }
    } catch (e) {
        if(q.domElement) q.domElement.style.opacity = '1';
        showStatus(`Err`, 'red');
    }
}

async function solveAll() {
  const storage = await chrome.storage.sync.get(['geminiApiKeys', 'geminiApiKey']);
  let keys = storage.geminiApiKeys || (storage.geminiApiKey ? [storage.geminiApiKey] : []);
  if (keys.length === 0) return alert('No API Keys');
  const questions = extractQuestions();
  for (let i = 0; i < questions.length; i++) await processQuestion(questions[i], keys);
  hideStatus();
}

function init() {
    unlockSite();
    window.addEventListener('keydown', async (e) => {
        if (e.altKey && (e.code === HOTKEY_CODE || e.key === 's')) {
            e.preventDefault(); await solveAll();
        }
    }, true);
    
    window.addEventListener('click', async (e) => {
        if (e.altKey) {
            const table = e.target.closest('table.question');
            const platonusWrapper = e.target.closest('.question-wrapper, .card');
            const storage = await chrome.storage.sync.get(['geminiApiKeys', 'geminiApiKey']);
            let keys = storage.geminiApiKeys || (storage.geminiApiKey ? [storage.geminiApiKey] : []);
            if (keys.length === 0) return;

            if (table) {
                e.preventDefault(); e.stopPropagation();
                const q = parseSingleUniverQuestion(table, 0);
                if (q) await processQuestion(q, keys);
                return;
            }
            if (platonusWrapper) {
                 e.preventDefault(); e.stopPropagation();
                 const qs = extractQuestions();
                 if (qs.length > 0) await processQuestion(qs[0], keys);
                 return;
            }
        }
    }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
