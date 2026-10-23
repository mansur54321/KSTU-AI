function readPlatonusQuestions(stateOnly = false) {
    const angular = typeof window !== 'undefined' && window.angular;
    if (!angular || typeof angular.element !== 'function') {
        return { error: 'Platonus Angular controller is unavailable' };
    }

    let controller = null;
    for (const node of [
        document.querySelector('[data-ui-view="content"]'),
        document.querySelector('#questionBlock')
    ]) {
        if (!node) continue;
        const element = angular.element(node);
        const candidate = typeof element.data === 'function'
            ? element.data('$ngControllerController')
            : null;
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
    if (testing?.testingID == null || testing.question?.questionID == null) {
        return { error: 'Platonus question data is unavailable' };
    }

    const currentNumber = Number(controller.client?.questionNumber) || 0;
    let pendingObserved = false;
    let currentSaving = false;
    try {
        const app = angular.element(document.querySelector('[ng-app]') || document.body);
        const pending = app.injector?.()?.get('$http')?.pendingRequests;
        if (Array.isArray(pending)) {
            pendingObserved = true;
            currentSaving = pending.some(request => {
                if (typeof request.url !== 'string') return false;
                const match = request.url.match(/(?:^|\/)rest\/testing_student\/openQuestion\/saveAnswer\/[^/]+\/[^/]+\/([^/]+)(?:\/|$)/);
                return match?.[1] === String(testing.question.questionID);
            });
        }
    } catch (error) {
        pendingObserved = false;
    }
    const state = {
        testingId: String(testing.testingID),
        attemptNumber: testing.attemptNumber == null ? '' : String(testing.attemptNumber),
        currentQuestionId: String(testing.question.questionID),
        currentNumber,
        completed: !!testing.completed,
        currentSaved: !!testing.question.selected && !currentSaving && (pendingObserved || testing.question.questionType !== 1),
        currentSaveError: controller.client?.questionList?.[currentNumber - 1]?.hasError === true
    };
    if (stateOnly === true) return state;

    const questions = Object.entries(testing.questionsMap)
        .filter(([key, question]) => Number.isInteger(Number(key)) && Number(key) > 0
            && question && [1, 2].includes(question.questionType)
            && question.questionID != null && typeof question.questionText === 'string'
            && Array.isArray(question.variants) && question.variants.length > 0
            && question.variants.every(variant => variant && variant.id != null && typeof variant.value === 'string'))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([key, question]) => ({
            questionId: String(question.questionID),
            number: Number(key),
            questionType: question.questionType,
            textHtml: question.questionText,
            variants: question.variants.map(variant => ({ id: String(variant.id), textHtml: variant.value })),
            isMultiSelect: question.questionType === 1
        }));

    return {
        ...state,
        questions
    };
}

globalThis.KSTU_READ_PLATONUS_QUESTIONS = readPlatonusQuestions;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = readPlatonusQuestions;
}
