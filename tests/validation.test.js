const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const evaluatePlatonusResult = require('../src/content/validation.js');

function question(number = 1, changes = {}) {
    return {
        questionId: `q${number}`,
        number,
        questionType: 2,
        textHtml: `<p>Question ${number}</p>`,
        variants: [{ id: 'v1', textHtml: 'First' }, { id: 'v2', textHtml: 'Second' }, { id: 'v3', textHtml: 'Third' }],
        selectedVariantIds: ['v1'],
        correctVariantIds: null,
        isCorrect: null,
        ...changes
    };
}

function snapshot(changes = {}) {
    return {
        ready: true,
        testingId: 'testing-1',
        attemptNumber: '2',
        total: 1,
        correct: 1,
        score: 100,
        questionCount: 1,
        questions: [question()],
        ...changes
    };
}

test('a complete 30/30 report confirms the selected variants of every supported question', () => {
    const result = evaluatePlatonusResult(snapshot({
        total: 30,
        correct: 30,
        questionCount: 30,
        questions: Array.from({ length: 30 }, (_, index) => question(index + 1))
    }));

    assert.deepEqual(result.summary, {
        testingId: 'testing-1', attemptNumber: '2', total: 30, correct: 30, score: 100,
        verified: 30, rejected: 0, unknown: 0
    });
    assert.equal(result.accepted.length, 30);
    assert.ok(result.accepted.every(item => item.evidence === 'platonus_full_score'));
    assert.deepEqual(result.accepted[0].correctVariantIds, ['v1']);
    assert.deepEqual(result.rejected, []);
});

test('26/30 and 86.67 percent do not identify the four wrong answers', () => {
    const result = evaluatePlatonusResult(snapshot({
        total: 30,
        correct: 26,
        score: 86.67,
        questionCount: 30,
        questions: Array.from({ length: 30 }, (_, index) => question(index + 1))
    }));

    assert.deepEqual(result.accepted, []);
    assert.deepEqual(result.rejected, []);
    assert.equal(result.summary.verified, 0);
    assert.equal(result.summary.rejected, 0);
    assert.equal(result.summary.unknown, 30);
});

test('an explicit correct variant set repairs a wrong selected answer', () => {
    const result = evaluatePlatonusResult(snapshot({
        correct: 0,
        score: 0,
        questions: [question(1, { isCorrect: false, correctVariantIds: ['v2'] })]
    }));

    assert.deepEqual(result.accepted[0].correctVariantIds, ['v2']);
    assert.equal(result.accepted[0].evidence, 'platonus_report_variants');
    assert.equal(result.summary.verified, 1);
    assert.equal(result.summary.unknown, 0);
    assert.deepEqual(result.rejected, []);
});

test('only exact true and false flags classify valid selected answers', () => {
    const result = evaluatePlatonusResult(snapshot({
        total: 4,
        correct: 1,
        score: 25,
        questionCount: 4,
        questions: [
            question(1, { isCorrect: true }),
            question(2, { isCorrect: false }),
            question(3, { isCorrect: undefined }),
            question(4, { isCorrect: 'false' })
        ]
    }));

    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0].evidence, 'platonus_report_correct');
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].questionId, 'q2');
    assert.equal(result.rejected[0].evidence, 'platonus_report_incorrect');
    assert.equal(result.rejected[0].correctVariantIds, null);
    assert.equal(result.summary.unknown, 2);
});

test('an omitted correctness flag remains unknown in a partial report', () => {
    const item = question();
    delete item.isCorrect;
    const result = evaluatePlatonusResult(snapshot({ correct: 0, questions: [item] }));

    assert.deepEqual(result.accepted, []);
    assert.deepEqual(result.rejected, []);
    assert.equal(result.summary.unknown, 1);
});

test('multi-select confirmation preserves the complete selected set', () => {
    const result = evaluatePlatonusResult(snapshot({
        questions: [question(1, { questionType: 1, selectedVariantIds: ['v3', 'v1'] })]
    }));

    assert.deepEqual(result.accepted[0].correctVariantIds, ['v3', 'v1']);
});

test('an explicit multi-select set preserves every correct variant', () => {
    const result = evaluatePlatonusResult(snapshot({
        correct: 0,
        questions: [question(1, { questionType: 1, correctVariantIds: ['v2', 'v3'], isCorrect: false })]
    }));

    assert.deepEqual(result.accepted[0].correctVariantIds, ['v2', 'v3']);
    assert.equal(result.accepted[0].evidence, 'platonus_report_variants');
});

for (const [name, changes] of [
    ['unknown selected ID', { selectedVariantIds: ['missing'] }],
    ['partially known multi-select set', { questionType: 1, selectedVariantIds: ['v1', 'missing'] }],
    ['duplicate selected IDs', { questionType: 1, selectedVariantIds: ['v1', 'v1'] }],
    ['empty selection', { selectedVariantIds: [] }],
    ['multiple selected IDs in a single-select question', { selectedVariantIds: ['v1', 'v2'] }],
    ['a numeric selected ID', { selectedVariantIds: [1] }],
    ['duplicate known variant IDs', { variants: [{ id: 'v1', textHtml: 'First' }, { id: 'v1', textHtml: 'Second' }] }],
    ['an empty known variant ID', { variants: [{ id: 'v1', textHtml: 'First' }, { id: '', textHtml: 'Second' }] }],
    ['a missing known variant ID', { variants: [{ id: 'v1', textHtml: 'First' }, { textHtml: 'Second' }] }],
    ['an empty variant list', { variants: [] }],
    ['unsupported question type', { questionType: 3 }],
    ['empty question identity', { questionId: '' }],
    ['incomplete question text', { textHtml: null }],
    ['incomplete variant text', { variants: [{ id: 'v1', textHtml: null }] }]
]) {
    test(`${name} cannot validate or reject an answer`, () => {
        for (const isCorrect of [true, false, null]) {
            const result = evaluatePlatonusResult(snapshot({ questions: [question(1, { ...changes, isCorrect })] }));
            assert.deepEqual(result.accepted, []);
            assert.deepEqual(result.rejected, []);
            assert.equal(result.summary.unknown, 1);
        }
    });
}

for (const correctVariantIds of [[], ['missing'], ['v1', 'missing'], ['v1', 'v1'], ['v1', 'v2']]) {
    test(`a malformed explicit single-select answer ${JSON.stringify(correctVariantIds)} never falls back to a guess`, () => {
        const result = evaluatePlatonusResult(snapshot({
            questions: [question(1, { correctVariantIds, isCorrect: true })]
        }));
        assert.deepEqual(result.accepted, []);
        assert.deepEqual(result.rejected, []);
    });
}

test('a rounded score of 100 cannot prove 29/30 answers', () => {
    const result = evaluatePlatonusResult(snapshot({ total: 30, correct: 29, score: 100, questionCount: 30 }));
    assert.deepEqual(result.accepted, []);
    assert.equal(result.summary.unknown, 30);
});

for (const questionCount of [undefined, null, 0, 29, 31, '30']) {
    test(`an incomplete raw question count ${String(questionCount)} disables full-score inference`, () => {
        const result = evaluatePlatonusResult(snapshot({ total: 30, correct: 30, questionCount }));
        assert.deepEqual(result.accepted, []);
        assert.equal(result.summary.unknown, 30);
    });
}

test('duplicate question identities are skipped and disable full-score inference', () => {
    const result = evaluatePlatonusResult(snapshot({
        total: 3, correct: 3, questionCount: 3,
        questions: [question(1, { isCorrect: true }), question(1, { isCorrect: false }), question(3)]
    }));
    assert.deepEqual(result.accepted, []);
    assert.deepEqual(result.rejected, []);
    assert.equal(result.summary.unknown, 3);
});

test('a false per-question result is never overwritten by an aggregate full score', () => {
    const result = evaluatePlatonusResult(snapshot({ questions: [question(1, { isCorrect: false })] }));
    assert.deepEqual(result.accepted, []);
    assert.equal(result.rejected.length, 1);
});

test('unready reports do not classify even explicit per-question evidence', () => {
    for (const ready of [false, undefined, 'true']) {
        const result = evaluatePlatonusResult(snapshot({ ready, questions: [question(1, { correctVariantIds: ['v2'] })] }));
        assert.deepEqual(result.accepted, []);
        assert.deepEqual(result.rejected, []);
        assert.equal(result.summary.unknown, 1);
    }
});

for (const changes of [
    { total: 0 }, { total: -1 }, { total: 1.5 }, { total: '1' },
    { correct: -1 }, { correct: 2 }, { correct: 0.5 }, { correct: '1' }, { correct: undefined }
]) {
    test(`invalid aggregate counts ${JSON.stringify(changes)} disable all classification`, () => {
        const result = evaluatePlatonusResult(snapshot({ ...changes, questions: [question(1, { isCorrect: true })] }));
        assert.deepEqual(result.accepted, []);
        assert.deepEqual(result.rejected, []);
        assert.ok(result.summary.unknown >= 0);
    });
}

test('too many question entries cannot produce negative unknown counts', () => {
    const result = evaluatePlatonusResult(snapshot({ questions: [question(1, { isCorrect: true }), question(2, { isCorrect: true })] }));
    assert.deepEqual(result.accepted, []);
    assert.deepEqual(result.rejected, []);
    assert.equal(result.summary.unknown, 1);
});

test('evaluation and mutation of its output preserve the source snapshot', () => {
    const input = snapshot();
    const before = JSON.stringify(input);
    const result = evaluatePlatonusResult(input);
    result.accepted[0].variants[0].textHtml = 'Changed';
    result.accepted[0].selectedVariantIds.push('v2');
    result.accepted[0].correctVariantIds.push('v3');
    assert.equal(JSON.stringify(input), before);
});

test('the policy is usable as a standalone browser script', () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/content/validation.js'), 'utf8'), context);
    assert.equal(typeof context.KSTU_VALIDATE_PLATONUS_RESULT, 'function');
    assert.equal(context.KSTU_VALIDATE_PLATONUS_RESULT(snapshot()).summary.verified, 1);
});

test('an absent snapshot is safe and yields no evidence', () => {
    const result = evaluatePlatonusResult();
    assert.deepEqual(result.accepted, []);
    assert.deepEqual(result.rejected, []);
    assert.equal(result.summary.unknown, 0);
});
