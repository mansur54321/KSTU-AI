const ANSWER_CACHE_KEY = 'answerCache';

function hashQuestion(text, answers) {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    const answerStrs = answers.map(a => `${a.id}:${a.text.trim().toLowerCase().replace(/\s+/g, ' ')}`).join('|');
    const raw = normalized + '||' + answerStrs;
    let h = 0;
    for (let i = 0; i < raw.length; i++) {
        h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
    }
    return 'q_' + Math.abs(h).toString(36);
}

async function serverCacheLookupByKey(key) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'cache_lookup', key }, (response) => {
            if (chrome.runtime.lastError || !response?.hit) return resolve(null);
            resolve(response.entry || null);
        });
    });
}

async function serverCacheStoreByKey(key, text, correctIds, reason, source = 'client') {
    chrome.runtime.sendMessage({
        action: 'cache_store',
        key,
        question_preview: text,
        correct: correctIds,
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
    const key = hashQuestion(text, answers);

    const serverEntry = await serverCacheLookupByKey(key);
    if (serverEntry?.correct?.length) {
        const cache = await getCache();
        cache[key] = {
            correct: serverEntry.correct,
            reason: serverEntry.reason || 'server_cache',
            ts: Date.now()
        };
        await saveCache(cache);
        return { correct: serverEntry.correct, reason: serverEntry.reason || 'server_cache', source: 'server' };
    }

    const cache = await getCache();
    const entry = cache[key];
    if (!entry) return null;
    return entry;
}

async function cacheStore(text, answers, correctIds, reason) {
    if (!text || !answers?.length || !correctIds?.length) return;
    const key = hashQuestion(text, answers);
    const cache = await getCache();
    cache[key] = { correct: correctIds, reason: reason || '', ts: Date.now() };
    await saveCache(cache);
    await serverCacheStoreByKey(key, text, correctIds, reason, 'local');
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
    questions.forEach(q => {
        const key = hashQuestion(q.text, q.answers);
        if (!cache[key]) {
            cache[key] = { correct: [q.correct], reason: 'from_results', ts: Date.now() };
            added++;
        }
        serverCacheStoreByKey(key, q.text, [q.correct], 'from_results', 'attempt_view');
    });
    await saveCache(cache);
    console.log(`${DEBUG_PREFIX} Cached ${added} new answers from AttemptView (${questions.length} total)`);
    return added;
}
