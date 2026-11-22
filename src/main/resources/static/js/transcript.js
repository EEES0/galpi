function displaySegmentTranslation(paragraph, text, targetLanguage, state) {
    let element = segmentTranslationElements.get(paragraph);
    if (!element) {
        element = document.createElement("p");
        paragraph.after(element);
        segmentTranslationElements.set(paragraph, element);
    }
    element.className = state === "ready"
        ? "utterance-translation segment-translation" : "utterance-translation";
    element.dataset.state = state;
    element.dataset.inputLanguage = targetLanguage;
    element.lang = targetLanguage;
    element.textContent = text;
    refreshSavedMarks();
}

function segmentTranslationKey(paragraph, targetLanguage) {
    return JSON.stringify([paragraph.dataset.inputLanguage, targetLanguage, paragraph.textContent]);
}

async function translateSegment(paragraph) {
    const text = paragraph.textContent;
    if (!text.trim()) {
        segmentTranslationElements.get(paragraph)?.remove();
        segmentTranslationElements.delete(paragraph);
        return;
    }
    const targetLanguage = userLanguageSelect.value;
    if (paragraph.dataset.inputLanguage === targetLanguage) {
        segmentTranslationElements.get(paragraph)?.remove();
        segmentTranslationElements.delete(paragraph);
        refreshSavedMarks();
        return;
    }
    const key = segmentTranslationKey(paragraph, targetLanguage);
    const generation = storageGeneration;
    displaySegmentTranslation(paragraph, translatedSegments.get(key) || t("translationLoading"),
        targetLanguage, translatedSegments.has(key) ? "ready" : "loading");
    if (translatedSegments.has(key)) return;

    let pending = pendingSegmentTranslations.get(key);
    if (!pending) {
        const controller = new AbortController();
        pending = {
            controller,
            promise: null
        };
        pending.promise = (async () => {
            const response = await fetch(TRANSLATE_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, targetLanguage }),
                signal: controller.signal
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            if (typeof data?.completeText !== "string" || !data.completeText.trim()) {
                throw new Error("Invalid translation response");
            }
            if (generation !== storageGeneration) return null;
            translatedSegments.set(key, data.completeText.trim());
            persistExplanations();
            return data.completeText.trim();
        })().finally(() => {
            if (pendingSegmentTranslations.get(key) === pending) pendingSegmentTranslations.delete(key);
        });
        pendingSegmentTranslations.set(key, pending);
    }

    try {
        const translation = await pending.promise;
        if (!translation || generation !== storageGeneration || userLanguageSelect.value !== targetLanguage ||
            !finalElement.contains(paragraph) || paragraph.textContent !== text) return;
        displaySegmentTranslation(paragraph, translation, targetLanguage, "ready");
    } catch (error) {
        if (generation !== storageGeneration || userLanguageSelect.value !== targetLanguage ||
            !finalElement.contains(paragraph) || paragraph.textContent !== text) return;
        displaySegmentTranslation(paragraph, t("translationError"), targetLanguage, "error");
        console.error("Translation Error:", error);
    }
}

function translateCompletedSegments() {
    finalElement.querySelectorAll(".segment").forEach(paragraph => translateSegment(paragraph));
}

function appendSegment(text, inputLanguage, timestamp = null) {
    const paragraph = document.createElement("p");
    paragraph.className = "segment";
    configureTranscriptEditor(paragraph);
    paragraph.dataset.inputLanguage = inputLanguage;
    paragraph.lang = inputLanguage;
    paragraph.textContent = text;
    if (typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp))) {
        paragraph.dataset.timestamp = timestamp;
        paragraph.dataset.timeLabel = new Date(timestamp).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
    }
    finalElement.appendChild(paragraph);
    return paragraph;
}


const editTranscriptButton = document.getElementById("edit-transcript");
let transcriptEditing = false;
function configureTranscriptEditor(paragraph) {
    paragraph.contentEditable = transcriptEditing ? "plaintext-only" : "false";
    if (transcriptEditing) {
        paragraph.setAttribute("role", "textbox");
        paragraph.setAttribute("aria-label", t("editTranscript"));
        paragraph.setAttribute("aria-multiline", "true");
    } else {
        paragraph.removeAttribute("role");
        paragraph.removeAttribute("aria-label");
        paragraph.removeAttribute("aria-multiline");
    }
}
function setTranscriptEditing(editing) {
    transcriptEditing = editing;
    editTranscriptButton.setAttribute("aria-pressed", String(editing));
    editTranscriptButton.dataset.i18n = editing ? "finishEditing" : "editTranscript";
    editTranscriptButton.textContent = t(editTranscriptButton.dataset.i18n);
    finalElement.querySelectorAll(".segment").forEach(configureTranscriptEditor);
    if (editing) { hideExplanation(); explanationRequest++; }
}
editTranscriptButton.addEventListener("click", () => setTranscriptEditing(!transcriptEditing));
finalElement.addEventListener("input", event => {
    const paragraph = event.target.closest(".segment");
    if (!transcriptEditing || !paragraph) return;
    segmentTranslationElements.get(paragraph)?.remove();
    segmentTranslationElements.delete(paragraph);
    refreshSavedMarks();
    persistExplanations();
});
finalElement.addEventListener("focusout", event => {
    const paragraph = event.target.closest(".segment");
    if (!paragraph) return;
    paragraph.textContent = paragraph.textContent;
    refreshSavedMarks();
    translateSegment(paragraph);
});
