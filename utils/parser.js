// Question Parser Module

/**
 * Process image source to base64 format
 */
export async function processImageSource(url) {
    try {
        if (!url || url.startsWith('file://')) return null;
        
        let base64Data, mimeType;
        
        if (url.startsWith('data:')) {
            const commaIdx = url.indexOf(',');
            if (commaIdx === -1) return null;
            const meta = url.substring(0, commaIdx);
            mimeType = (meta.match(/data:([^;]+);/) || [])[1] || 'image/jpeg';
            base64Data = url.substring(commaIdx + 1);
        } else {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Image Fetch Error');
            const blob = await response.blob();
            mimeType = blob.type;
            base64Data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
        }
        
        return { base64: base64Data, mime: mimeType };
    } catch (e) {
        console.error('Error processing image:', e);
        return null;
    }
}

/**
 * Parse a single question table
 */
export function parseQuestion(table, index) {
    const textElem = table.querySelector('.text');
    if (!textElem) return null;
    
    const qImages = [];
    textElem.querySelectorAll('img').forEach(img => {
        if (img.src) qImages.push(img.src);
    });

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
            
            if (textDiv) {
                const img = textDiv.querySelector('img');
                if (img) ansImgSrc = img.src;
            }

            answers.push({
                id: label.innerText.replace('.', '').trim(),
                text: ansText,
                imgSrc: ansImgSrc,
                element: input,
                textElement: textDiv
            });
        }
    });
    
    return {
        number: index + 1,
        text: textElem.innerText.trim(),
        images: qImages,
        answers: answers,
        isMultiSelect: answerTable.dataset.qtype === '2',
        domElement: table
    };
}

/**
 * Extract all questions from the page
 */
export function extractQuestions() {
    const questions = [];
    document.querySelectorAll('table.question').forEach((table, index) => {
        const q = parseQuestion(table, index);
        if (q) questions.push(q);
    });
    return questions;
}
