const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const readPlatonusResult = require('../src/background/platonus-result.js');

function makeController() {
    return {
        page: { url: 'result' },
        testing: {
            testingID: 10,
            attemptNumber: 2,
            completed: true,
            personID: 'private',
            studentTestingCode: 'private',
            report: { showRightAnswers: false, markList: ['private'] },
            questionsMap: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [index + 1, {
                questionID: 101 + index,
                questionType: 2,
                questionText: `<p>Question ${index + 1}</p>`,
                selectedVariantID: 201 + index,
                variants: [{ id: 201 + index, value: `Choice ${index + 1}` }]
            }]))
        }
    };
}

function resultTable(values = ['30', '0', '0', '26', '0', '0', '86.67']) {
    return {
        tHead: { rows: [{ cells: [{ colSpan: 3 }, { colSpan: 3 }, { colSpan: 1 }] }] },
        tBodies: [{ rows: [{ cells: values.map(textContent => ({ textContent })) }] }]
    };
}

function snapshot(controller, tables = [resultTable()], scoped = false) {
    const view = {};
    const block = {};
    const result = vm.runInNewContext(`(${readPlatonusResult.toString()})()`, {
        window: {
            angular: {
                element: node => ({
                    data: () => !scoped && node === view ? controller : undefined,
                    scope: () => scoped && node === block ? { vm: controller } : undefined
                })
            }
        },
        document: {
            querySelector: selector => selector === '#questionBlock' ? block : view,
            querySelectorAll: selector => selector === '#questionBlock table' ? tables : []
        }
    });
    return JSON.parse(JSON.stringify(result));
}

test('completed result reads the actual 26/30 summary without a current question', () => {
    const controller = makeController();
    const result = snapshot(controller);

    assert.equal(controller.testing.question, undefined);
    assert.deepEqual({
        ready: result.ready, testingId: result.testingId, attemptNumber: result.attemptNumber,
        total: result.total, correct: result.correct, score: result.score, questionCount: result.questionCount
    }, { ready: true, testingId: '10', attemptNumber: '2', total: 30, correct: 26, score: 86.67, questionCount: 30 });
    assert.equal(result.questions.length, 30);
    assert.equal(result.questions[0].isCorrect, null);
    assert.equal(result.questions[0].correctVariantIds, null);
    assert.doesNotMatch(JSON.stringify(result), /personID|studentTestingCode|markList|private/);
});

test('result waits for completion, result page, report and a matching result table', () => {
    const controller = makeController();
    controller.testing.completed = false;
    assert.deepEqual(snapshot(controller), { ready: false });
    controller.testing.completed = true;
    delete controller.testing.report;
    assert.deepEqual(snapshot(controller), { ready: false });
    controller.testing.report = {};
    controller.page.url = 'change-question';
    assert.deepEqual(snapshot(controller), { ready: false });
    controller.page.url = 'result';
    assert.deepEqual(snapshot(controller, []), { ready: false });
});

test('unrelated seven-column tables do not become the aggregate result', () => {
    const controller = makeController();
    const unrelated = resultTable();
    unrelated.tHead.rows[0].cells = Array.from({ length: 7 }, () => ({ colSpan: 1 }));
    assert.deepEqual(snapshot(controller, [unrelated]), { ready: false });
    assert.equal(snapshot(controller, [unrelated, resultTable()]).correct, 26);
});

test('invalid or blank counts and impossible per-group totals remain unready', () => {
    for (const values of [
        ['', '0', '0', '0', '0', '0', '0'],
        ['30', '0', '0', '31', '0', '0', '100'],
        ['30', '0', '0', '26', '1', '0', '90'],
        ['30.5', '0', '0', '26', '0', '0', '86'],
        ['30', '0', '0', '-1', '0', '0', '0'],
        ['30', '0', '0', '26', '0', '0', 'Infinity'],
        ['0', '0', '0', '0', '0', '0', '0']
    ]) assert.deepEqual(snapshot(makeController(), [resultTable(values)]), { ready: false });
});

test('difficulty groups are summed and a localized decimal score is supported', () => {
    const result = snapshot(makeController(), [resultTable(['10', '12', '8', '9', '11', '6', '86,67'])]);
    assert.equal(result.total, 30);
    assert.equal(result.correct, 26);
    assert.equal(result.score, 86.67);
});

test('per-question evidence requires own strict booleans and explicit variant objects', () => {
    const controller = makeController();
    controller.testing.report.questionsRightMap = Object.assign(Object.create({ 101: false }), { 102: false, 103: true, 104: 0 });
    controller.testing.report.rightVariants = { 102: [{ id: 202, value: 'Choice' }], 103: [{ id: 'unrecognized-variant' }], 104: ['204'] };
    const questions = snapshot(controller).questions;

    assert.deepEqual(questions.slice(0, 4).map(question => question.isCorrect), [null, false, true, null]);
    assert.deepEqual(questions.slice(0, 4).map(question => question.correctVariantIds), [null, ['202'], ['unrecognized-variant'], null]);
});

test('single selected unknown IDs stay explicit while only strict changed flags select multi variants', () => {
    const controller = makeController();
    controller.testing.questionsMap[1].selectedVariantID = 'unrecognized-variant';
    controller.testing.questionsMap[2].questionType = 1;
    controller.testing.questionsMap[2].variants = [
        { id: 202, value: 'First', changed: true },
        { id: 302, value: 'Second', changed: 'true' },
        { id: 402, value: 'Third', changed: false }
    ];
    const result = snapshot(controller);

    assert.deepEqual(result.questions[0].selectedVariantIds, ['unrecognized-variant']);
    assert.deepEqual(result.questions[1].selectedVariantIds, ['202']);
    assert.deepEqual(result.questions[1].variants, [
        { id: '202', textHtml: 'First' }, { id: '302', textHtml: 'Second' }, { id: '402', textHtml: 'Third' }
    ]);
});

test('scope fallback copies data without mutating the report or questions', () => {
    const controller = makeController();
    const original = JSON.stringify(controller);
    const result = snapshot(controller, [resultTable()], true);
    result.questions[0].variants[0].textHtml = 'Changed copy';
    assert.equal(JSON.stringify(controller), original);
    assert.equal(result.ready, true);
});

function background(executeScript) {
    let onMessage;
    const context = vm.createContext({
        console,
        chrome: {
            runtime: {
                onMessage: { addListener: listener => { onMessage = listener; } },
                onInstalled: { addListener() {} }, onStartup: { addListener() {} }
            },
            alarms: { onAlarm: { addListener() {} } },
            scripting: { executeScript }
        }
    });
    context.importScripts = (...files) => files.forEach(file => {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background', file), 'utf8'), context);
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background/background.js'), 'utf8'), context);
    return sender => new Promise(resolve => {
        assert.equal(onMessage({ action: 'get_platonus_result' }, sender, resolve), true);
    });
}

test('result action reads the requesting tab and frame in MAIN world', async () => {
    const expected = snapshot(makeController());
    let invocation;
    const send = background(async options => {
        invocation = options;
        return [{ result: expected }];
    });
    assert.deepEqual(await send({ tab: { id: 17 }, frameId: 3 }), expected);
    assert.equal(invocation.world, 'MAIN');
    assert.equal(invocation.target.tabId, 17);
    assert.deepEqual(Array.from(invocation.target.frameIds), [3]);
    assert.equal(invocation.func.name, 'readPlatonusResult');
});

test('result action rejects missing tab identity and returns script execution errors', async () => {
    let calls = 0;
    const send = background(async () => { calls++; throw new Error('Execution unavailable'); });
    assert.equal(typeof (await send({})).error, 'string');
    assert.equal(calls, 0);
    assert.equal((await send({ tab: { id: 17 } })).error, 'Execution unavailable');
});
