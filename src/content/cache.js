const ANSWER_CACHE_KEY = 'answerCache';
let cacheWriteChain = Promise.resolve();

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
    return new Promise(resolve => {
        try {
            chrome.runtime.sendMessage({
                action: 'cache_store', key, question_preview: text,
                correct: correctIds, correctTexts, reason: reason || '', source
            }, response => {
                const error = chrome.runtime.lastError?.message || response?.error;
                const acknowledged = ['ok', 'success', 'stored', 'updated', 'saved'].includes(response?.status)
                    || response?.success === true || response?.ok === true || response?.stored === true;
                const refused = ['error', 'failed', 'rejected', 'denied', 'invalid', 'queued', 'pending'].includes(response?.status);
                if (error || refused || !acknowledged || response?.success === false || response?.ok === false || response?.stored === false) {
                    resolve({ status: 'error', error: error || 'No cache store acknowledgement' });
                } else {
                    resolve(response);
                }
            });
        } catch (error) {
            resolve({ status: 'error', error: error.message || String(error) });
        }
    });
}

async function getCache() {
    const data = await chrome.storage.local.get([ANSWER_CACHE_KEY]);
    return data[ANSWER_CACHE_KEY] || {};
}

async function saveCache(cache) {
    await chrome.storage.local.set({ [ANSWER_CACHE_KEY]: cache });
}

function updateCache(update) {
    const write = cacheWriteChain.then(async () => {
        const cache = await getCache();
        const result = update(cache);
        await saveCache(cache);
        return result;
    });
    cacheWriteChain = write.catch(() => {});
    return write;
}

function isVerifiedCacheEntry(entry) {
    return entry?.source === 'attempt_view' || (!entry?.source && entry?.reason === 'from_results');
}

function correctSetFingerprint(answers, correct) {
    return JSON.stringify([...new Set(correctIdsToAnswerTexts(answers, correct))].sort());
}

function verifiedCacheAnswer(cache, keys, answers, type) {
    for (const key of keys) {
        if (!isVerifiedCacheEntry(cache[key])) continue;
        const mapped = entryToCurrentAnswer(cache[key], answers, type);
        if (mapped && !isRejectedCacheAnswer(cache, keys, answers, mapped, type)) return mapped;
    }
    return null;
}

function isRejectedCacheAnswer(cache, keys, answers, mapped, type) {
    if (type !== 'choice' || !mapped?.correct?.length) return false;
    const fingerprint = correctSetFingerprint(answers, mapped.correct);
    return keys.some(key => cache[key]?.rejectedSets?.includes(fingerprint));
}

async function cacheLookup(text, answers, images = [], type = 'choice') {
    if (!text) return null;
    if (type === 'choice' && !answers?.length) return null;
    const keys = await cacheKeys(text, answers, images);
    const primaryKey = keys[0];
    await cacheWriteChain;
    const localVerified = verifiedCacheAnswer(await getCache(), keys, answers, type);
    if (localVerified) return localVerified;

    for (const key of keys) {
        const serverEntry = await serverCacheLookupByKey(key);
        if (serverEntry?.correct?.length || serverEntry?.correctTexts?.length) {
            const mapped = entryToCurrentAnswer(serverEntry, answers, type);
            if (!mapped) continue;
            const stored = await updateCache(cache => {
                const verified = verifiedCacheAnswer(cache, keys, answers, type);
                if (verified) return { answer: verified, fromServer: false };
                if (isRejectedCacheAnswer(cache, keys, answers, mapped, type)) return null;
                cache[primaryKey] = {
                    correct: mapped.correct || [],
                    correctTexts: serverEntry.correctTexts || correctIdsToAnswerTexts(answers, mapped.correct || []),
                    reason: serverEntry.reason || 'server_cache',
                    source: isVerifiedCacheEntry(serverEntry) ? 'attempt_view' : key === primaryKey ? 'server' : 'server_legacy',
                    rejectedSets: cache[primaryKey]?.rejectedSets || [],
                    ts: Date.now()
                };
                return { answer: mapped, entry: cache[primaryKey], fromServer: true };
            });
            if (!stored) continue;
            if (stored.fromServer && key !== primaryKey && isVerifiedCacheEntry(stored.entry)) {
                serverCacheStoreByKey(primaryKey, text, mapped.correct || [], 'legacy_migrated', 'attempt_view', stored.entry.correctTexts);
            }
            return stored.answer;
        }
    }

    return updateCache(cache => {
        const verified = verifiedCacheAnswer(cache, keys, answers, type);
        if (verified) return verified;
        for (const key of keys) {
            const entry = cache[key];
            if (!entry) continue;
            const mapped = entryToCurrentAnswer(entry, answers, type);
            if (!mapped || isRejectedCacheAnswer(cache, keys, answers, mapped, type)) continue;
            if (key !== primaryKey) {
                cache[primaryKey] = { ...entry, correct: mapped.correct || [], rejectedSets: cache[primaryKey]?.rejectedSets || [], source: 'local_legacy', ts: Date.now() };
            }
            return mapped;
        }
        return null;
    });
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
    await updateCache(cache => {
        const previous = entryToCurrentAnswer(cache[key], answers, type);
        if (isVerifiedCacheEntry(cache[key]) && !isRejectedCacheAnswer(cache, [key], answers, previous, type)) return;
        if (type === 'choice' && isRejectedCacheAnswer(cache, [key], answers, { correct }, type)) return;
        cache[key] = {
            correct, correctTexts, reason: result.reason || '', source: 'local',
            rejectedSets: cache[key]?.rejectedSets || [], ts: Date.now()
        };
    });
}

function validationAnswerIds(question, variantIds) {
    if (typeof question?.text !== 'string' || !question.text.trim() || !Array.isArray(question.answers)
        || !Array.isArray(variantIds) || !variantIds.length) return null;
    if (question.answers.some(answer => typeof answer?.variantId !== 'string' || !answer.variantId.trim()
        || typeof answer.id !== 'string' || !answer.id.trim())) return null;
    if (new Set(question.answers.map(answer => answer.variantId)).size !== question.answers.length
        || new Set(question.answers.map(answer => answer.id)).size !== question.answers.length) return null;
    if (new Set(variantIds).size !== variantIds.length) return null;
    const correct = [];
    for (const variantId of variantIds) {
        if (typeof variantId !== 'string' || !variantId.trim()) return null;
        const matches = question.answers.filter(answer => answer.variantId === variantId);
        if (matches.length !== 1 || typeof matches[0].id !== 'string' || !matches[0].id) return null;
        correct.push(matches[0].id);
    }
    return new Set(correct).size === correct.length ? correct : null;
}

async function applyPlatonusValidation(verdict) {
    const counts = { verified: 0, rejected: 0, uploaded: 0, failed: 0 };
    const accepted = [];
    const rejected = [];
    for (const [items, variantField, target] of [
        [verdict?.accepted || [], 'correctVariantIds', accepted],
        [verdict?.rejected || [], 'selectedVariantIds', rejected]
    ]) {
        for (const question of items) {
            const correct = validationAnswerIds(question, question?.[variantField]);
            if (!correct) {
                counts.failed++;
                continue;
            }
            target.push({
                ...question, correct,
                key: await hashQuestion(question.text, question.answers, question.images || []),
                correctTexts: correctIdsToAnswerTexts(question.answers, correct),
                fingerprint: correctSetFingerprint(question.answers, correct)
            });
        }
    }
    if (accepted.length || rejected.length) {
        await updateCache(cache => {
            for (const question of rejected) {
                const previous = cache[question.key] || {};
                const rejectedSets = [...new Set([...(previous.rejectedSets || []), question.fingerprint])];
                const mapped = entryToCurrentAnswer(previous, question.answers);
                const matches = mapped && correctSetFingerprint(question.answers, mapped.correct) === question.fingerprint;
                cache[question.key] = {
                    ...previous, rejectedSets,
                    ...(!mapped || matches ? { validation: 'rejected' } : {})
                };
            }
            for (const question of accepted) {
                cache[question.key] = {
                    correct: question.correct, correctTexts: question.correctTexts,
                    reason: question.evidence, source: 'attempt_view', ts: Date.now(),
                    rejectedSets: (cache[question.key]?.rejectedSets || []).filter(value => value !== question.fingerprint)
                };
            }
        });
        counts.verified = accepted.length;
        counts.rejected = rejected.length;
        for (const question of accepted) {
            const response = await serverCacheStoreByKey(
                question.key, question.text, question.correct, question.evidence, 'attempt_view', question.correctTexts
            );
            if (response?.status === 'error' || response?.error || !response) counts.failed++;
            else counts.uploaded++;
        }
    }
    const summary = {};
    for (const key of ['testingId', 'attemptNumber', 'total', 'correct', 'score', 'unknown']) {
        const value = verdict?.summary?.[key];
        if (typeof value === 'string' || typeof value === 'number') summary[key] = value;
    }
    await chrome.storage.local.set({ platonusValidationSummary: { ...summary, ...counts } });
    return counts;
}

globalThis.applyPlatonusValidation = applyPlatonusValidation;

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
    const entries = [];
    for (const q of questions) {
        const key = await hashQuestion(q.text, q.answers, q.images);
        const correctTexts = correctIdsToAnswerTexts(q.answers, [q.correct]);
        entries.push({ q, key, correctTexts });
    }
    const added = await updateCache(cache => {
        let count = 0;
        for (const { q, key, correctTexts } of entries) {
            if (!cache[key]) count++;
            const fingerprint = correctSetFingerprint(q.answers, [q.correct]);
            cache[key] = {
                correct: [q.correct], correctTexts, reason: 'from_results', source: 'attempt_view', ts: Date.now(),
                rejectedSets: (cache[key]?.rejectedSets || []).filter(value => value !== fingerprint)
            };
        }
        return count;
    });
    for (const { q, key, correctTexts } of entries) {
        serverCacheStoreByKey(key, q.text, [q.correct], 'from_results', 'attempt_view', correctTexts);
    }
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
        entryToCurrentAnswer,
        applyPlatonusValidation
    };
}
