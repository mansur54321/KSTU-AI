const ANSWER_CACHE_KEY = 'answerCache';

function normalizeCacheText(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function fallbackHash(value) {
    // Deterministic 128-bit hash for non-secure contexts where crypto.subtle is
    // unavailable (e.g. http portals). Consistent within the same page, so both
    // store and lookup in the content script agree.
    let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x85ebca6b, h4 = 0xc2b2ae35;
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193);
        h2 = (Math.imul(h2 ^ c, 0x01000193) + (h2 >>> 0)) >>> 0;
        h3 = Math.imul(h3 ^ c, 0x9e3779b1);
        h4 = (Math.imul(h4 ^ c, 0x85ebca6b) + (h4 >>> 0)) >>> 0;
    }
    return [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

async function sha256(value) {
    if (globalThis.crypto?.subtle) {
        const bytes = new TextEncoder().encode(value);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return fallbackHash(value);
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
    const answerSet = (answers || []).map(answerIdentity).filter(Boolean).sort().join('|');
    const hash = await sha256(`${normalizedQuestion}||${questionImages}||${answerSet}`);
    return 'q_' + hash.slice(0, 32);
}

async function hashQuestionV344(text, answers, images = []) {
    const normalizedQuestion = normalizeCacheText(text);
    const questionImages = collectImageTokens(images);
    const answerSet = (answers || [])
        .map(a => normalizeCacheText(a?.text) || imageToken(a?.imgSrc))
        .filter(Boolean)
        .sort()
        .join('|');
    const hash = await sha256(`${normalizedQuestion}||${questionImages}||${answerSet}`);
    return 'q_' + hash.slice(0, 32);
}

async function hashQuestionV343(text, answers) {
    const normalizedQuestion = normalizeCacheText(text);
    const answerSet = (answers || []).map(a => normalizeCacheText(a.text)).filter(Boolean).sort().join('|');
    const hash = await sha256(`${normalizedQuestion}||${answerSet}`);
    return 'q_' + hash.slice(0, 32);
}

async function cacheKeys(text, answers, images = []) {
    const keys = [
        await hashQuestion(text, answers, images),
        await hashQuestionV344(text, answers, images),
        await hashQuestionV343(text, answers)
    ];
    return [...new Set(keys)];
}

function correctIdsToAnswerTexts(answers, correctIds) {
    return correctIds
        .map(id => {
            const match = (answers || []).find(a => a.id === id);
            return match ? answerIdentity(match) : normalizeCacheText(id);
        })
        .filter(Boolean);
}

function answerTextsToCurrentIds(answers, correctTexts) {
    const correctSet = new Set((correctTexts || []).map(normalizeCacheText));
    return answers.filter(a =>
        correctSet.has(answerIdentity(a)) || correctSet.has(normalizeCacheText(a.text))
    ).map(a => a.id);
}

function pairsToTexts(pairs) {
    return (pairs || []).map(p => `${p.zone}:${p.item}`);
}

function textsToPairs(correctTexts) {
    return (correctTexts || [])
        .map(t => {
            const parts = String(t).split(':');
            const zone = parseInt(parts[0], 10);
            const item = parts.slice(1).join(':');
            if (!Number.isInteger(zone) || !item) return null;
            return { zone, item };
        })
        .filter(Boolean);
}

function entryToCurrentAnswer(entry, answers, type = 'choice') {
    if (!entry) return null;
    const reason = entry.reason || 'cache';
    const source = entry.source || 'cache';

    if (type === 'text_input') {
        const answer = (entry.correctTexts?.[0] ?? '').toString();
        if (!answer) return null;
        return { answer, reason, source };
    }

    if (type === 'moodle_dd') {
        const pairs = textsToPairs(entry.correctTexts);
        if (!pairs.length) return null;
        return { pairs, reason, source };
    }

    // choice
    if (entry.correctTexts?.length) {
        const currentIds = answerTextsToCurrentIds(answers, entry.correctTexts);
        if (currentIds.length) return { correct: currentIds, reason, source };
    }
    if (entry.correct?.length) {
        const valid = entry.correct.filter(id => (answers || []).some(a => a.id === id));
        if (valid.length) return { correct: valid, reason, source };
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

async function getCache() {
    const data = await chrome.storage.local.get([ANSWER_CACHE_KEY]);
    return data[ANSWER_CACHE_KEY] || {};
}

async function saveCache(cache) {
    await chrome.storage.local.set({ [ANSWER_CACHE_KEY]: cache });
}

async function cacheLookup(text, answers, images = [], type = 'choice') {
    if (!text) return null;
    if (type === 'choice' && !answers?.length) return null;
    const keys = await cacheKeys(text, answers, images);
    const primaryKey = keys[0];

    for (const key of keys) {
        const serverEntry = await serverCacheLookupByKey(key);
        if (serverEntry?.correct?.length || serverEntry?.correctTexts?.length) {
            const mapped = entryToCurrentAnswer(serverEntry, answers, type);
            if (!mapped) continue;
            const cache = await getCache();
            cache[primaryKey] = {
                correct: mapped.correct || [],
                correctTexts: serverEntry.correctTexts || correctIdsToAnswerTexts(answers, mapped.correct || []),
                reason: serverEntry.reason || 'server_cache',
                source: key === primaryKey ? 'server' : 'server_legacy',
                ts: Date.now()
            };
            await saveCache(cache);
            if (key !== primaryKey) {
                serverCacheStoreByKey(primaryKey, text, mapped.correct || [], 'legacy_migrated', 'attempt_view', cache[primaryKey].correctTexts);
            }
            return mapped;
        }
    }

    const cache = await getCache();
    for (const key of keys) {
        const entry = cache[key];
        if (!entry) continue;
        const mapped = entryToCurrentAnswer(entry, answers, type);
        if (!mapped) continue;
        if (key !== primaryKey) {
            cache[primaryKey] = { ...entry, correct: mapped.correct || [], source: 'local_legacy', ts: Date.now() };
            await saveCache(cache);
        }
        return mapped;
    }
    return null;
}

async function cacheStoreFromResult(text, answers, result, images = [], type = 'choice') {
    if (!result || !text) return;

    let correct = [];
    let correctTexts = [];

    if (type === 'text_input') {
        if (result.answer === undefined) return;
        correctTexts = [String(result.answer)];
    } else if (type === 'moodle_dd') {
        if (!result.pairs?.length) return;
        correctTexts = pairsToTexts(result.pairs);
    } else {
        if (!result.correct?.length) return;
        correct = result.correct;
        correctTexts = correctIdsToAnswerTexts(answers, result.correct);
    }

    if (!correctTexts.length) return;
    const key = await hashQuestion(text, answers, images);
    const cache = await getCache();
    cache[key] = {
        correct,
        correctTexts,
        reason: result.reason || '',
        source: 'local',
        ts: Date.now()
    };
    await saveCache(cache);
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        normalizeCacheText,
        sha256,
        hashQuestion,
        hashQuestionV344,
        hashQuestionV343,
        cacheKeys,
        correctIdsToAnswerTexts,
        answerTextsToCurrentIds,
        pairsToTexts,
        textsToPairs,
        entryToCurrentAnswer
    };
}
