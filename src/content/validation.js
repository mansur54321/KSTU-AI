(function () {
    'use strict';

    function validId(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function answerSet(ids, questionType, knownIds) {
        if (!Array.isArray(ids) || ids.length === 0 || (questionType === 2 && ids.length !== 1)) return null;
        if (!ids.every(id => validId(id) && knownIds.has(id)) || new Set(ids).size !== ids.length) return null;
        return ids.slice();
    }

    function copyQuestion(question, correctVariantIds, evidence) {
        return {
            ...question,
            variants: question.variants.map(variant => ({ ...variant })),
            selectedVariantIds: question.selectedVariantIds.slice(),
            correctVariantIds,
            evidence
        };
    }

    function evaluatePlatonusResult(snapshot) {
        const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
        const total = Number.isSafeInteger(source.total) && source.total > 0 ? source.total : 0;
        const summary = {
            testingId: typeof source.testingId === 'string' ? source.testingId : '',
            attemptNumber: typeof source.attemptNumber === 'string' ? source.attemptNumber : '',
            total,
            correct: typeof source.correct === 'number' && Number.isFinite(source.correct) ? source.correct : null,
            score: typeof source.score === 'number' && Number.isFinite(source.score) ? source.score : null,
            verified: 0,
            rejected: 0,
            unknown: total
        };
        const result = { summary, accepted: [], rejected: [] };
        if (source.ready !== true || total === 0 || !Number.isSafeInteger(source.correct)
            || source.correct < 0 || source.correct > total || !Array.isArray(source.questions)
            || source.questions.length > total) return result;

        const idCounts = new Map();
        for (const question of source.questions) {
            if (validId(question?.questionId)) {
                idCounts.set(question.questionId, (idCounts.get(question.questionId) || 0) + 1);
            }
        }
        const fullScore = source.correct === total && source.questionCount === total
            && source.questions.every(question => validId(question?.questionId) && idCounts.get(question.questionId) === 1);

        for (const question of source.questions) {
            if (!question || !validId(question.questionId) || idCounts.get(question.questionId) !== 1
                || !Number.isSafeInteger(question.number) || question.number < 1
                || (question.questionType !== 1 && question.questionType !== 2)
                || typeof question.textHtml !== 'string' || !Array.isArray(question.selectedVariantIds)
                || !Array.isArray(question.variants) || question.variants.length === 0
                || !question.variants.every(variant => variant && validId(variant.id) && typeof variant.textHtml === 'string')
                || (question.isCorrect != null && typeof question.isCorrect !== 'boolean')) continue;

            const knownIds = new Set(question.variants.map(variant => variant.id));
            if (knownIds.size !== question.variants.length) continue;

            if (question.correctVariantIds != null) {
                const correctIds = answerSet(question.correctVariantIds, question.questionType, knownIds);
                if (correctIds) result.accepted.push(copyQuestion(question, correctIds, 'platonus_report_variants'));
                continue;
            }

            const selectedIds = answerSet(question.selectedVariantIds, question.questionType, knownIds);
            if (!selectedIds) continue;
            if (question.isCorrect === false) {
                result.rejected.push(copyQuestion(question, null, 'platonus_report_incorrect'));
            } else if (question.isCorrect === true || fullScore) {
                result.accepted.push(copyQuestion(question, selectedIds,
                    question.isCorrect === true ? 'platonus_report_correct' : 'platonus_full_score'));
            }
        }

        summary.verified = result.accepted.length;
        summary.rejected = result.rejected.length;
        summary.unknown = total - summary.verified - summary.rejected;
        return result;
    }

    globalThis.KSTU_VALIDATE_PLATONUS_RESULT = evaluatePlatonusResult;
    if (typeof module !== 'undefined' && module.exports) module.exports = evaluatePlatonusResult;
})();
