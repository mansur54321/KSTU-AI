class QuestionPrefetch {
    constructor(load) {
        this.load = load;
        this.promises = new Map();
        this.queue = [];
        this.active = 0;
        this.stopped = false;
    }

    enqueue(key, question) {
        if (this.promises.has(key)) return this.promises.get(key);

        let resolve;
        let reject;
        const promise = new Promise((onResolve, onReject) => {
            resolve = onResolve;
            reject = onReject;
        });
        promise.catch(() => {});
        this.promises.set(key, promise);

        if (this.stopped) {
            resolve(null);
        } else {
            this.queue.push({ question, resolve, reject });
            this.drain();
        }
        return promise;
    }

    get(key) {
        return this.promises.get(key);
    }

    stop() {
        this.stopped = true;
        for (const job of this.queue.splice(0)) job.resolve(null);
    }

    drain() {
        while (!this.stopped && this.active < 3 && this.queue.length) {
            const job = this.queue.shift();
            this.active++;
            Promise.resolve()
                .then(() => this.stopped ? null : this.load(job.question))
                .then(job.resolve, job.reject)
                .finally(() => {
                    this.active--;
                    this.drain();
                });
        }
    }
}

globalThis.KSTU_QUESTION_PREFETCH = QuestionPrefetch;
if (typeof module !== 'undefined' && module.exports) module.exports = QuestionPrefetch;
