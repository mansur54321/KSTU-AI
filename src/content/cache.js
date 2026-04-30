const ANSWER_CACHE_KEY = 'answerCache';

function normalizeCacheText(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function imageToken(src) {
    if (!src) return '';
    try {
        const url = new URL(src, location.href);
        const name = url.pathname.split('/').pop() || url.pathname;
        return normalizeCacheText(name);
    } catch (e) {
        return normalizeCacheText(src.split('/').pop() || src);
    }
}

function collectImageTokens(images = []) {
    return images.map(imageToken).filter(Boolean).sort().join('|');
}

function answerIdentity(answer) {
    const text = normalizeCacheText(answer?.text);
    const img = imageToken(answer?.imgSrc);
    return `${text}::img=${img}`;
}

async function hashQuestion(text, answers, images = []) {
    const normalizedQuestion = normalizeCacheText(text);
    const questionImages = collectImageTokens(images);
    const answerSet = answers.map(answerIdentity).filter(Boolean).sort().join('|');
    const hash = await sha256(`${normalizedQuestion}||${questionImages}||${answerSet}`);
    return 'q_' + hash.slice(0, 32);
}

function correctIdsToAnswerTexts(answers, correctIds) {
    return correctIds
        .map(id => answerIdentity(answers.find(a => a.id === id)))
        .filter(Boolean)
        .map(normalizeCacheText);
}

function answerTextsToCurrentIds(answers, correctTexts) {
    const correctSet = new Set((correctTexts || []).map(normalizeCacheText));
    return answers.filter(a => correctSet.has(answerIdentity(a))).map(a => a.id);
}

function entryToCurrentAnswer(entry, answers) {
    if (!entry) return null;
    if (entry.correctTexts?.length) {
        const currentIds = answerTextsToCurrentIds(answers, entry.correctTexts);
        if (currentIds.length) return { correct: currentIds, reason: entry.reason || 'cache', source: entry.source || 'cache' };
    }
    return null;
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

async function localCacheStore(text, answers, correctIds, reason, images = []) {
    if (!text || !answers?.length || !correctIds?.length) return;
    const key = await hashQuestion(text, answers, images);
    const correctTexts = correctIdsToAnswerTexts(answers, correctIds);
    if (!correctTexts.length) return;
    const cache = await getCache();
    cache[key] = { correct: correctIds, correctTexts, reason: reason || '', source: 'local', ts: Date.now() };
    await saveCache(cache);
}

async function getCache() {
    const data = await chrome.storage.local.get([ANSWER_CACHE_KEY]);
    return data[ANSWER_CACHE_KEY] || {};
}

async function saveCache(cache) {
    await chrome.storage.local.set({ [ANSWER_CACHE_KEY]: cache });
}

async function cacheLookup(text, answers, images = []) {
    if (!text || !answers?.length) return null;
    const key = await hashQuestion(text, answers, images);

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

async function cacheStore(text, answers, correctIds, reason, images = []) {
    if (!text || !answers?.length || !correctIds?.length) return;
    const key = await hashQuestion(text, answers, images);
    const correctTexts = correctIdsToAnswerTexts(answers, correctIds);
    if (!correctTexts.length) return;
    const cache = await getCache();
    cache[key] = { correct: correctIds, correctTexts, reason: reason || '', source: 'trusted', ts: Date.now() };
    await saveCache(cache);
    await serverCacheStoreByKey(key, text, correctIds, reason, 'attempt_view', correctTexts);
}

async function cacheStoreFromResult(text, answers, result, images = []) {
    if (!result) return;
    if (result.correct) {
        await localCacheStore(text, answers, result.correct, result.reason, images);
    } else if (result.answer !== undefined) {
        await localCacheStore(text, answers, [String(result.answer)], result.reason, images);
    } else if (result.pairs) {
        await localCacheStore(text, answers, result.pairs.map(p => `${p.zone}:${p.item}`), result.reason, images);
    }
}

function parseAttemptView() {
    const questions = [];
    const rows = document.querySelectorAll('#table1 tr');
    rows.forEach(row => {
        const questionDiv = row.querySelector('.question');
        const answersTable = row.querySelector('.answersTable');
        if (!questionDiv || !answersTable) return;

        const questionText = questionDiv.innerText.trim();
        const images = Array.from(questionDiv.querySelectorAll('img')).map(img => img.src).filter(Boolean);
        const answers = [];
        answersTable.querySelectorAll('tr').forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length >= 2) {
                const id = cells[0].innerText.replace('.', '').trim();
                const text = cells[1].innerText.trim();
                const imgSrc = cells[1].querySelector('img')?.src;
                if (id && (text || imgSrc)) answers.push({ id, text, imgSrc });
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
            questions.push({ text: questionText, answers, images, correct: correctAnswer });
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
        const key = await hashQuestion(q.text, q.answers, q.images);
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
