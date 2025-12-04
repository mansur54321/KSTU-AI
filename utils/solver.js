// Solver Module
import { askAI } from './api.js';
import { showStatus } from './ui.js';

/**
 * Process a single question
 */
export async function processQuestion(question, apiKey, provider = 'gemini') {
    showStatus(`Thinking Q${question.number}...`, '#1976d2');
    question.domElement.style.opacity = '0.7';

    try {
        const response = await askAI(question, apiKey, provider);
        question.domElement.style.opacity = '1';

        if (response && response.result && response.result.correct.length > 0) {
            const { result, model } = response;
            
            // Apply answer by clicking the checkbox/radio
            question.answers.forEach(ans => {
                if (result.correct.includes(ans.id)) {
                    if (!ans.element.checked) {
                        ans.element.click();
                    }
                }
            });
            
            showStatus(`Solved via ${model}`, '#2e7d32');
        } else {
            showStatus(`No answer for Q${question.number}`, '#ff9800');
        }
    } catch (e) {
        question.domElement.style.opacity = '1';
        showStatus(`Error Q${question.number}`, 'red');
        console.error('Processing error:', e);
    }
}
