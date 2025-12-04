// API Client Module
import { CONFIG } from './config.js';
import { processImageSource } from './parser.js';

/**
 * Build prompt for AI
 */
function buildPrompt(question) {
    let optionsText = "";
    question.answers.forEach(ans => {
        optionsText += `${ans.id}. ${ans.text}\n`;
    });

    return `
Question: ${question.text}
Type: ${question.isMultiSelect ? 'Multi-choice' : 'Single'}
Options:
${optionsText}

Task:
1. Select correct option(s).
2. Provide a very short explanation (max 10 words) in Russian.

Return JSON ONLY: 
{"correct": ["A"], "reason": "explanation"}
`;
}

/**
 * Prepare image parts for Gemini API
 */
async function prepareGeminiImageParts(question) {
    const parts = [];
    
    // Images from Question
    for (const url of question.images) {
        const img = await processImageSource(url);
        if (img) {
            parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
        }
    }

    // Images from answer options
    for (const ans of question.answers) {
        if (ans.imgSrc) {
            const img = await processImageSource(ans.imgSrc);
            if (img) {
                parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
            }
        }
    }
    
    return parts;
}

/**
 * Ask Gemini API
 */
async function askGemini(question, apiKey) {
    const prompt = buildPrompt(question);
    const imageParts = await prepareGeminiImageParts(question);
    
    const parts = [{ text: prompt }, ...imageParts];
    
    const requestBody = {
        contents: [{ parts: parts }],
        generationConfig: {
            responseMimeType: CONFIG.RESPONSE_MIME_TYPE,
            temperature: CONFIG.TEMPERATURE
        }
    };

    // Visual logging
    console.group(`❓ Q${question.number}`);
    console.log(`%c📝 Prompt:`, 'color: #2196F3;', prompt);
    
    if (imageParts.length > 0) {
        console.groupCollapsed(`📸 Images (${imageParts.length})`);
        imageParts.forEach((part) => {
            const url = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
            console.log('%c ', `font-size: 1px; padding: 50px; background: url('${url}') no-repeat center/contain;`);
        });
        console.groupEnd();
    }

    // Try models in hierarchy
    for (const model of CONFIG.GEMINI_MODELS) {
        try {
            console.log(`📡 Sending to: %c${model}`, 'color: blue; font-weight: bold');
            const response = await fetch(`${CONFIG.GEMINI_BASE_URL}${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            // Handle Limits (429) & Overload (503)
            if (response.status === 429 || response.status === 503) {
                console.warn(`⚠️ ${model} status ${response.status}. Next...`);
                continue;
            }

            if (!response.ok) {
                const errTxt = await response.text();
                throw new Error(`API Error: ${errTxt}`);
            }

            const data = await response.json();
            const result = JSON.parse(data.candidates[0].content.parts[0].text);
            
            console.log(`%c✅ Result:`, 'color: green; font-weight: bold;', result);
            console.groupEnd();
            
            return { result, model };

        } catch (e) {
            console.error(`❌ Error ${model}:`, e);
        }
    }
    
    console.groupEnd();
    return null;
}

/**
 * Ask OpenRouter API
 */
async function askOpenRouter(question, apiKey) {
    const prompt = buildPrompt(question);
    
    // OpenRouter uses OpenAI-compatible format
    const messages = [
        {
            role: "user",
            content: prompt
        }
    ];

    console.group(`❓ Q${question.number} (OpenRouter)`);
    console.log(`%c📝 Prompt:`, 'color: #2196F3;', prompt);

    // Try models in hierarchy
    for (const model of CONFIG.OPENROUTER_MODELS) {
        try {
            console.log(`📡 Sending to: %c${model}`, 'color: purple; font-weight: bold');
            const response = await fetch(CONFIG.OPENROUTER_BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'AI Test Solver'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: CONFIG.TEMPERATURE,
                    response_format: { type: "json_object" }
                })
            });

            if (response.status === 429 || response.status === 503) {
                console.warn(`⚠️ ${model} status ${response.status}. Next...`);
                continue;
            }

            if (!response.ok) {
                const errTxt = await response.text();
                throw new Error(`API Error: ${errTxt}`);
            }

            const data = await response.json();
            const result = JSON.parse(data.choices[0].message.content);
            
            console.log(`%c✅ Result:`, 'color: green; font-weight: bold;', result);
            console.groupEnd();
            
            return { result, model };

        } catch (e) {
            console.error(`❌ Error ${model}:`, e);
        }
    }
    
    console.groupEnd();
    return null;
}

/**
 * Main API function - routes to correct provider
 */
export async function askAI(question, apiKey, provider = 'gemini') {
    if (provider === 'openrouter') {
        return await askOpenRouter(question, apiKey);
    } else {
        return await askGemini(question, apiKey);
    }
}
