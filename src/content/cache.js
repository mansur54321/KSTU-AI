const ANSWER_CACHE_KEY = 'answerCache';

function normalizeCacheText(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashQuestion(text, answers) {
    const normalizedQuestion = normalizeCacheText(text);
    const answerSet = answers.map(a => normalizeCacheText(a.text)).filter(Boolean).sort().join('|');
    const hash = await sha256(`${normalizedQuestion}||${answerSet}`);
    return 'q_' + hash.slice(0, 32);
}

function correctIdsToAnswerTexts(answers, correctIds) {
    return correctIds
        .map(id => answers.find(a => a.id === id)?.text)
        .filter(Boolean)
        .map(normalizeCacheText);
}

function answerTextsToCurrentIds(answers, correctTexts) {
    const correctSet = new Set((correctTexts || []).map(normalizeCacheText));
    return answers.filter(a => correctSet.has(normalizeCacheText(a.text))).map(a => a.id);
}

function entryToCurrentAnswer(entry, answers) {
    if (!entry) return null;
    if (entry.correctTexts?.length) {
        const currentIds = answerTextsToCurrentIds(answers, entry.correctTexts);
        if (currentIds.length) return { correct: currentIds, reason: entry.reason || 'cache', source: entry.source || 'cache' };
    }
    return { correct: entry.correct || [], reason: entry.reason || 'cache', source: entry.source || 'cache' };
}

async function serverCacheLookupByKey(key) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'cache_lookup', key }, (response) => {
            if (chrome.runtime.lastError || !response?.hit) return resolve(null);
            resolve(response.entry || null);
        });
    });
}

async function serverCacheStoreByKey(key, text, correctIds, reason, source = 'client', correctTexts = []) {
    chrome.runtime.sendMessage({
        action: 'cache_store',
        key,
        question_preview: text,
        correct: correctIds,
        correctTexts,
        reason: reason || '',
        source
    });
}

async function getCache() {
    const data = await chrome.storage.local.get([ANSWER_CACHE_KEY]);
    return data[ANSWER_CACHE_KEY] || {};
}

async function saveCache(cache) {
    await chrome.storage.local.set({ [ANSWER_CACHE_KEY]: cache });
}

async function cacheLookup(text, answers) {
    if (!text || !answers?.length) return null;
    const key = await hashQuestion(text, answers);

    const serverEntry = await serverCacheLookupByKey(key);
    if (serverEntry?.correct?.length) {
        const mapped = entryToCurrentAnswer(serverEntry, answers);
        if (!mapped?.correct?.length) return null;
        const cache = await getCache();
        cache[key] = {
            correct: serverEntry.correct,
            correctTexts: serverEntry.correctTexts || [],
            reason: serverEntry.reason || 'server_cache',
            source: 'server',
            ts: Date.now()
        };
        await saveCache(cache);
        return mapped;
    }

    const cache = await getCache();
    const entry = cache[key];
    if (!entry) return null;
    return entryToCurrentAnswer(entry, answers);
}

async function cacheStore(text, answers, correctIds, reason) {
    if (!text || !answers?.length || !correctIds?.length) return;
    const key = await hashQuestion(text, answers);
    const correctTexts = correctIdsToAnswerTexts(answers, correctIds);
    const cache = await getCache();
    cache[key] = { correct: correctIds, correctTexts, reason: reason || '', ts: Date.now() };
    await saveCache(cache);
    await serverCacheStoreByKey(key, text, correctIds, reason, 'local', correctTexts);
}

async function cacheStoreFromResult(text, answers, result) {
    if (!result) return;
    if (result.correct) {
        await cacheStore(text, answers, result.correct, result.reason);
    } else if (result.answer !== undefined) {
        await cacheStore(text, answers, [String(result.answer)], result.reason);
    } else if (result.pairs) {
        await cacheStore(text, answers, result.pairs.map(p => `${p.zone}:${p.item}`), result.reason);
    }
}

function parseAttemptView() {
    const questions = [];
    const rows = document.querySelectorAll('#table1 tr');
    rows.forEach(row => {
        const questionDiv = row.querySelector('.question');
        const answersTable = row.querySelector('.answersTable');
        const correctEl = row.querySelector('span.val');
        if (!questionDiv || !answersTable) return;

        const questionText = questionDiv.innerText.trim();
        const answers = [];
        answersTable.querySelectorAll('tr').forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length >= 2) {
                const id = cells[0].innerText.replace('.', '').trim();
                const text = cells[1].innerText.trim();
                if (id && text) answers.push({ id, text });
            }
        });

        const valSpans = row.querySelectorAll('span.val');
        let correctAnswer = '';
        valSpans.forEach(span => {
            const prev = span.previousElementSibling;
            if (prev && prev.textContent.includes('Правильный ответ')) {
                correctAnswer = span.innerText.trim();
            }
        });

        if (answers.length && correctAnswer) {
            questions.push({ text: questionText, answers, correct: correctAnswer });
        }
    });
    return questions;
}

async function cacheFromAttemptView() {
    const questions = parseAttemptView();
    if (!questions.length) {
        console.log(`${DEBUG_PREFIX} No questions found on AttemptView page`);
        return 0;
    }
    const cache = await getCache();
    let added = 0;
    for (const q of questions) {
        const key = await hashQuestion(q.text, q.answers);
        const correctTexts = correctIdsToAnswerTexts(q.answers, [q.correct]);
        if (!cache[key]) {
            cache[key] = { correct: [q.correct], correctTexts, reason: 'from_results', ts: Date.now() };
            added++;
        }
        serverCacheStoreByKey(key, q.text, [q.correct], 'from_results', 'attempt_view', correctTexts);
    }
    await saveCache(cache);
    console.log(`${DEBUG_PREFIX} Cached ${added} new answers from AttemptView (${questions.length} total)`);
    return added;
}
