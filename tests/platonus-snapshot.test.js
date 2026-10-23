const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const readPlatonusQuestions = require('../src/background/platonus.js');

function makeController() {
    const question = {
        questionID: 101,
        questionType: 2,
        questionText: '<p>Current question</p>',
        selectedVariantID: 201,
        variants: [{ id: 201, value: '<p>First answer</p>', isRight: true }]
    };
    return {
        client: { questionNumber: 1 },
        testing: {
            testingID: 10,
            attemptNumber: 2,
            completed: false,
            personID: 'private',
            question,
            questionsMap: {
                10: { questionID: 110, questionType: 1, questionText: 'Later question', variants: [{ id: 210, value: 'Choice', changed: true }] },
                1: question,
                2: { questionID: 102, questionType: 2, questionText: 'Next question', variants: [{ id: 202, value: '<img src="answer.png">' }] }
            }
        }
    };
}

function snapshot(controller, scoped = false, stateOnly = false, pendingRequests) {
    const view = {};
    const questionBlock = {};
    const result = vm.runInNewContext(`(${readPlatonusQuestions.toString()})(stateOnly)`, {
        stateOnly,
        window: {
            angular: {
                element: node => ({
                    data: () => !scoped && node === view ? controller : undefined,
                    scope: () => scoped && node === questionBlock ? { vm: controller } : undefined,
                    injector: () => pendingRequests === undefined ? undefined : { get: () => ({ pendingRequests }) }
                })
            }
        },
        document: { querySelector: selector => selector === '#questionBlock' ? questionBlock : view }
    });
    return JSON.parse(JSON.stringify(result));
}

test('Platonus snapshot copies current and future choice questions in question order', () => {
    assert.deepEqual(snapshot(makeController()), {
        testingId: '10',
        attemptNumber: '2',
        currentQuestionId: '101',
        currentNumber: 1,
        completed: false,
        currentSaved: false,
        currentSaveError: false,
        questions: [
            { questionId: '101', number: 1, questionType: 2, textHtml: '<p>Current question</p>', variants: [{ id: '201', textHtml: '<p>First answer</p>' }], isMultiSelect: false },
            { questionId: '102', number: 2, questionType: 2, textHtml: 'Next question', variants: [{ id: '202', textHtml: '<img src="answer.png">' }], isMultiSelect: false },
            { questionId: '110', number: 10, questionType: 1, textHtml: 'Later question', variants: [{ id: '210', textHtml: 'Choice' }], isMultiSelect: true }
        ]
    });
});

test('Platonus snapshot falls back to the question block scope without changing controller data', () => {
    const controller = makeController();
    const original = JSON.stringify(controller);
    const result = snapshot(controller, true);
    result.questions[0].variants[0].textHtml = 'Changed copy';

    assert.equal(JSON.stringify(controller), original);
    assert.equal(result.testingId, '10');
});

test('Platonus snapshot excludes unsupported and incomplete questions', () => {
    const controller = makeController();
    for (const type of [3, 4, 5]) {
        controller.testing.questionsMap[type] = { questionID: 100 + type, questionType: type, questionText: 'Unsupported', variants: [{ id: 203, value: 'Choice' }] };
    }
    controller.testing.questionsMap[6] = { questionID: 106, questionType: 2, questionText: 'Empty', variants: [] };
    controller.testing.questionsMap[7] = { questionID: 107, questionType: 2, questionText: 'Incomplete', variants: [{ id: 207, value: 'Choice' }, { value: 'Missing identity' }] };

    assert.deepEqual(snapshot(controller).questions.map(question => question.number), [1, 2, 10]);
});

test('Platonus snapshot contains no selected answers, correctness flags, or person fields', () => {
    const serialized = JSON.stringify(snapshot(makeController()));
    assert.doesNotMatch(serialized, /selectedVariantID|isRight|changed|personID|private/);
});

test('state-only snapshot reports acknowledged saving without reading future questions', () => {
    const controller = makeController();
    controller.testing.question.selected = true;
    controller.client.questionList = [{ hasError: false }];
    Object.defineProperty(controller.testing.questionsMap[2], 'questionText', {
        get() { throw new Error('Future question should not be read while polling saved state'); }
    });

    assert.deepEqual(snapshot(controller, false, true), {
        testingId: '10',
        attemptNumber: '2',
        currentQuestionId: '101',
        currentNumber: 1,
        completed: false,
        currentSaved: true,
        currentSaveError: false
    });
});

test('saved-state booleans distinguish an API save error and require strict state-only mode', () => {
    const controller = makeController();
    controller.client.questionList = [{ hasError: true }];
    const state = snapshot(controller, false, true);

    assert.equal(state.currentSaved, false);
    assert.equal(state.currentSaveError, true);
    assert.equal('questions' in state, false);
    assert.equal(snapshot(controller, false, 'true').questions.length, 3);
    assert.doesNotMatch(JSON.stringify(state), /selectedVariantID|isRight|changed|personID|private/);
});

test('multi-choice saving waits for every pending save request of the current question', () => {
    const controller = makeController();
    controller.testing.question.questionType = 1;
    controller.testing.question.selected = true;
    const pending = [
        { method: 'PUT', url: 'rest/testing_student/openQuestion/saveAnswer/ru/1/101/201/true/10/2' },
        { method: 'PUT', url: 'https://platonus.test/rest/testing_student/openQuestion/saveAnswer/ru/1/101/202/true/10/2' }
    ];
    const initial = JSON.stringify(pending);

    assert.equal(snapshot(controller, false, true, pending).currentSaved, false);
    assert.equal(JSON.stringify(pending), initial);
    pending.shift();
    assert.equal(snapshot(controller, false, true, pending).currentSaved, false);
    pending.shift();
    assert.equal(snapshot(controller, false, true, pending).currentSaved, true);
});

test('save requests of other questions and other endpoints do not block the current question', () => {
    const controller = makeController();
    controller.testing.question.questionType = 1;
    controller.testing.question.selected = true;
    const pending = [
        { url: 'rest/testing_student/openQuestion/saveAnswer/ru/1/1010/201/true/10/2' },
        { url: 'rest/testing_student/openQuestion/saveAnswer/ru/1/102/202/true/10/2' },
        { url: 'rest/testing_student/processing/ru/10' }
    ];

    assert.equal(snapshot(controller, false, true, pending).currentSaved, true);
});

test('multi-choice saving is unconfirmed when pending HTTP requests cannot be observed', () => {
    const controller = makeController();
    controller.testing.question.questionType = 1;
    controller.testing.question.selected = true;

    assert.equal(snapshot(controller, false, true).currentSaved, false);
});

test('Platonus snapshot returns an error when Angular or the current question is unavailable', () => {
    const unavailable = vm.runInNewContext(`(${readPlatonusQuestions.toString()})()`, { window: {} });
    assert.equal(typeof unavailable.error, 'string');

    const controller = makeController();
    delete controller.testing.question;
    assert.equal(typeof snapshot(controller).error, 'string');
});

function background(executeScript) {
    let onMessage;
    const imports = [];
    const context = vm.createContext({
        console,
        chrome: {
            runtime: {
                onMessage: { addListener: listener => { onMessage = listener; } },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} }
            },
            alarms: { onAlarm: { addListener() {} } },
            scripting: { executeScript }
        }
    });
    context.importScripts = (...files) => {
        for (const file of files) {
            imports.push(file);
            vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background', file), 'utf8'), context);
        }
    };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background/background.js'), 'utf8'), context);
    return {
        imports,
        send: (sender, stateOnly = false) => new Promise(resolve => {
            assert.equal(onMessage({ action: 'get_platonus_questions', stateOnly }, sender, resolve), true);
        })
    };
}

test('background reads Platonus data in the requesting tab and frame in MAIN world', async () => {
    const expected = snapshot(makeController());
    let invocation;
    const worker = background(async options => {
        invocation = options;
        return [{ result: expected }];
    });

    assert.deepEqual(await worker.send({ tab: { id: 17 }, frameId: 3 }), expected);
    assert.deepEqual(worker.imports, ['../config.js', 'platonus.js', 'platonus-result.js']);
    assert.equal(invocation.world, 'MAIN');
    assert.equal(invocation.target.tabId, 17);
    assert.deepEqual(Array.from(invocation.target.frameIds), [3]);
    assert.equal(invocation.func.name, 'readPlatonusQuestions');
    assert.deepEqual(Array.from(invocation.args), [false]);
    await worker.send({ tab: { id: 17 } }, true);
    assert.deepEqual(Array.from(invocation.args), [true]);
    await worker.send({ tab: { id: 17 } }, 'true');
    assert.deepEqual(Array.from(invocation.args), [false]);
});

test('background rejects missing tab identity and returns execution failures', async () => {
    let calls = 0;
    const worker = background(async () => {
        calls++;
        throw new Error('Script execution unavailable');
    });
    const missingTab = await worker.send({});
    assert.equal(typeof missingTab.error, 'string');
    assert.equal(calls, 0);
    const failed = await worker.send({ tab: { id: 17 } });
    assert.equal(failed.error, 'Script execution unavailable');
    assert.equal(calls, 1);
});
