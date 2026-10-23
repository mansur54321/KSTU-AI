const test = require('node:test');
const assert = require('node:assert/strict');
const QuestionPrefetch = require('../src/content/prefetch.js');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('three question loads overlap', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const started = [];
    const queue = new QuestionPrefetch(question => {
        started.push(question);
        return gates[question].promise;
    });
    const jobs = gates.map((gate, index) => queue.enqueue(String(index), index));

    await flush();
    assert.deepEqual(started, [0, 1, 2]);

    gates.forEach((gate, index) => gate.resolve(`answer-${index}`));
    assert.deepEqual(await Promise.all(jobs), ['answer-0', 'answer-1', 'answer-2']);
});

test('a fourth question waits for an available load slot', async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started = [];
    const queue = new QuestionPrefetch(question => {
        started.push(question);
        return gates[question].promise;
    });
    const jobs = gates.map((gate, index) => queue.enqueue(String(index), index));

    await flush();
    assert.deepEqual(started, [0, 1, 2]);

    gates[1].resolve('second');
    await flush();
    assert.deepEqual(started, [0, 1, 2, 3]);

    gates[0].resolve('first');
    gates[2].resolve('third');
    gates[3].resolve('fourth');
    assert.deepEqual(await Promise.all(jobs), ['first', 'second', 'third', 'fourth']);
});

test('the same question key reuses its pending and completed promise', async () => {
    const gate = deferred();
    let calls = 0;
    const question = { questionId: 'question-a' };
    const queue = new QuestionPrefetch(snapshot => {
        calls++;
        assert.equal(snapshot, question);
        return gate.promise;
    });
    const first = queue.enqueue('a', question);

    assert.equal(queue.enqueue('a', { questionId: 'ignored' }), first);
    assert.equal(queue.get('a'), first);
    assert.equal(queue.get('missing'), undefined);
    await flush();
    assert.equal(calls, 1);

    gate.resolve('answer-a');
    assert.equal(await first, 'answer-a');
    assert.equal(queue.enqueue('a', question), first);
    assert.equal(queue.get('a'), first);
    assert.equal(calls, 1);
});

test('out-of-order results stay associated with their question keys', async () => {
    const gates = { a: deferred(), b: deferred(), c: deferred() };
    const queue = new QuestionPrefetch(question => gates[question].promise);
    const a = queue.enqueue('a', 'a');
    const b = queue.enqueue('b', 'b');
    const c = queue.enqueue('c', 'c');
    await flush();

    gates.c.resolve('answer-c');
    gates.a.resolve('answer-a');
    gates.b.resolve('answer-b');

    assert.deepEqual(await Promise.all([a, b, c]), ['answer-a', 'answer-b', 'answer-c']);
    assert.equal(await queue.get('c'), 'answer-c');
    assert.equal(await queue.get('a'), 'answer-a');
    assert.equal(await queue.get('b'), 'answer-b');
});

test('stop resolves queued jobs without launching them and lets active loads complete', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const started = [];
    const queue = new QuestionPrefetch(question => {
        started.push(question);
        return gates[question].promise;
    });
    const active = gates.map((gate, index) => queue.enqueue(String(index), index));
    const queued = queue.enqueue('queued', 3);
    await flush();

    queue.stop();

    assert.equal(await queued, null);
    assert.equal(queue.get('queued'), queued);
    assert.equal(await queue.enqueue('new', 4), null);
    gates.forEach((gate, index) => gate.resolve(`answer-${index}`));
    assert.deepEqual(await Promise.all(active), ['answer-0', 'answer-1', 'answer-2']);
    await flush();
    assert.deepEqual(started, [0, 1, 2]);
});

test('an early background failure remains available to the foreground caller', async () => {
    const gate = deferred();
    const failure = new Error('fixture load failed');
    let calls = 0;
    const queue = new QuestionPrefetch(() => {
        calls++;
        return gate.promise;
    });
    const job = queue.enqueue('failed', {});
    await flush();

    gate.reject(failure);
    await flush();

    await assert.rejects(job, error => error === failure);
    assert.equal(queue.get('failed'), job);
    assert.equal(queue.enqueue('failed', {}), job);
    assert.equal(calls, 1);
});
