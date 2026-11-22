function capturePageState() {
    return {
        inputLanguage: inputLanguageSelect.value,
        userLanguage: userLanguageSelect.value,
        translations: Array.from(translatedSegments),
        explanations: Array.from(savedExplanations),
        segments: Array.from(finalElement.querySelectorAll(".segment"), node => ({
            text: node.textContent,
            inputLanguage: node.dataset.inputLanguage || "ko-KR",
            timestamp: node.dataset.timestamp || null
        }))
    };
}

function persistExplanations() { schedulePageSave(); }

function restoreExplanations(saved) {
    try {
        if (!saved || !Array.isArray(saved.explanations) || !Array.isArray(saved.segments)) return;
        if (supportedLanguages.has(saved.inputLanguage)) inputLanguageSelect.value = saved.inputLanguage;
        if (supportedLanguages.has(saved.userLanguage)) userLanguageSelect.value = saved.userLanguage;
        if (Array.isArray(saved.translations)) {
            for (const entry of saved.translations) {
                if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" ||
                    typeof entry[1] !== "string" || !entry[1].trim()) continue;
                try {
                    const [inputLanguage, targetLanguage, text] = JSON.parse(entry[0]);
                    if (supportedLanguages.has(inputLanguage) && supportedLanguages.has(targetLanguage) &&
                        typeof text === "string") translatedSegments.set(entry[0], entry[1]);
                } catch {}
            }
        }
        for (const entry of saved.explanations) {
            if (!Array.isArray(entry) || entry.length !== 2) continue;
            const [key, value] = entry;
            if (typeof key === "string" && typeof value?.term === "string" &&
                supportedLanguages.has(value?.inputLanguage) && supportedLanguages.has(value?.userLanguage) &&
                typeof value?.data?.description === "string" && typeof value?.data?.translation === "string" &&
                typeof value.context === "string" &&
                Array.isArray(value.segmentation?.segments) && value.segmentation.segments.length > 0 &&
                value.segmentation.segments.every(text => typeof text === "string") &&
                Array.isArray(value.segmentation.languages) &&
                value.segmentation.languages.length === value.segmentation.segments.length &&
                value.segmentation.languages.every(language => supportedLanguages.has(language)) &&
                Number.isInteger(value.segmentation.startOffset) && Number.isInteger(value.segmentation.endOffset) &&
                key === termKey(value.term, value.context, value.segmentation, value.inputLanguage, value.userLanguage)) {
                savedExplanations.set(key, value);
            }
        }
        for (const segment of saved.segments) {
            const text = typeof segment === "string" ? segment : segment?.text;
            if (typeof text !== "string") continue;
            const inputLanguage = supportedLanguages.has(segment?.inputLanguage)
                ? segment.inputLanguage : "ko-KR";
            appendSegment(text, inputLanguage, segment?.timestamp);
        }
    } catch (error) {
        console.warn("저장된 설명을 불러올 수 없습니다.", error);
    }
}
