function readPlatonusResult() {
    const angular = typeof window !== 'undefined' && window.angular;
    if (!angular || typeof angular.element !== 'function') return { ready: false };

    let controller = null;
    for (const node of [
        document.querySelector('[data-ui-view="content"]'),
        document.querySelector('#questionBlock')
    ]) {
        if (!node) continue;
        const element = angular.element(node);
        const candidate = typeof element.data === 'function' ? element.data('$ngControllerController') : null;
        if (candidate?.testing?.questionsMap) {
            controller = candidate;
            break;
        }
        const scoped = typeof element.scope === 'function' ? element.scope()?.vm : null;
        if (scoped?.testing?.questionsMap) {
            controller = scoped;
            break;
        }
    }

    const testing = controller?.testing;
    const report = testing?.report;
    if (testing?.testingID == null || testing.completed !== true || controller.page?.url !== 'result'
        || !report || typeof report !== 'object' || Array.isArray(report)) return { ready: false };

    let aggregate = null;
    for (const table of document.querySelectorAll('#questionBlock table')) {
        const headers = table.tHead?.rows[0]?.cells;
        const cells = table.tBodies?.[0]?.rows[0]?.cells;
        if (headers?.length !== 3 || headers[0].colSpan !== 3 || headers[1].colSpan !== 3
            || headers[2].colSpan !== 1 || cells?.length !== 7) continue;
        const values = Array.from(cells, cell => cell.textContent.trim());
        if (values.some(value => !value)) continue;
        const counts = values.slice(0, 6).map(Number);
        const score = Number(values[6].replace(',', '.'));
        if (!counts.every(value => Number.isInteger(value) && value >= 0) || !Number.isFinite(score)) continue;
        if (counts.slice(3).some((value, index) => value > counts[index])) continue;
        const total = counts[0] + counts[1] + counts[2];
        if (!total) continue;
        aggregate = { total, correct: counts[3] + counts[4] + counts[5], score };
        break;
    }
    if (!aggregate) return { ready: false };

    const questions = Object.entries(testing.questionsMap)
        .filter(([key, question]) => Number.isInteger(Number(key)) && Number(key) > 0
            && question && [1, 2].includes(question.questionType)
            && question.questionID != null && typeof question.questionText === 'string'
            && Array.isArray(question.variants) && question.variants.length > 0
            && question.variants.every(variant => variant && variant.id != null && typeof variant.value === 'string'))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([key, question]) => {
            const questionId = String(question.questionID);
            const right = Object.prototype.hasOwnProperty.call(report.rightVariants || {}, questionId)
                ? report.rightVariants[questionId] : null;
            const correct = Object.prototype.hasOwnProperty.call(report.questionsRightMap || {}, questionId)
                ? report.questionsRightMap[questionId] : null;
            const selected = question.selectedVariantID;
            return {
                questionId,
                number: Number(key),
                questionType: question.questionType,
                textHtml: question.questionText,
                variants: question.variants.map(variant => ({ id: String(variant.id), textHtml: variant.value })),
                selectedVariantIds: question.questionType === 1
                    ? question.variants.filter(variant => variant.changed === true).map(variant => String(variant.id))
                    : selected != null && selected !== '' && String(selected) !== '0' ? [String(selected)] : [],
                correctVariantIds: Array.isArray(right) && right.every(variant => variant && variant.id != null)
                    ? right.map(variant => String(variant.id)) : null,
                isCorrect: typeof correct === 'boolean' ? correct : null
            };
        });

    return {
        ready: true,
        testingId: String(testing.testingID),
        attemptNumber: testing.attemptNumber == null ? '' : String(testing.attemptNumber),
        ...aggregate,
        questionCount: Object.keys(testing.questionsMap).length,
        questions
    };
}

globalThis.KSTU_READ_PLATONUS_RESULT = readPlatonusResult;
if (typeof module !== 'undefined' && module.exports) module.exports = readPlatonusResult;
