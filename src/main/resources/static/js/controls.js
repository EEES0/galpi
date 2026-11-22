clearBtn.addEventListener("click", () => {
    hideExplanation();
    selectedRange = null;
    activeExplanationKey = null;
    savedMarks = [];
    if (window.CSS?.highlights) CSS.highlights.delete("saved-terms");
    finalElement.textContent = interimElement.textContent = "";
    explanationRequest++;
    selectedElement.textContent = responseElement.textContent = "";
    storageGeneration++;
    savedExplanations.clear();
    pendingExplanations.clear();
    requestedExplanations.clear();
    translatedSegments.clear();
    for (const pending of pendingSegmentTranslations.values()) pending.controller.abort();
    pendingSegmentTranslations.clear();
    clearTimeout(selectionTimer);
    selectionTimer = undefined;
    startedInTranscript = false;
    persistExplanations();
});

deleteExplanationBtn.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    startedInTranscript = false;
    clearTimeout(selectionTimer);
    selectionTimer = undefined;
});

deleteExplanationBtn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const activeSegmentation = selectedRange ? getSegmentation(selectedRange) : null;
    const keyToDelete = activeExplanationKey || (activeSegmentation
        ? termKey(selectedElement.textContent.trim(), "", activeSegmentation)
        : null);
    if (!keyToDelete) return;
    explanationRequest++;
    const [inputLanguage, userLanguage, term, , segmentation] = JSON.parse(keyToDelete);
    for (const cache of [savedExplanations, pendingExplanations, requestedExplanations]) {
        for (const key of cache.keys()) {
            const [savedInput, savedUser, savedTerm, , savedSegmentation] = JSON.parse(key);
            if (savedInput === inputLanguage && savedUser === userLanguage && savedTerm.trim() === term.trim() &&
                Boolean(savedSegmentation?.summary) === Boolean(segmentation?.summary) &&
                Boolean(savedSegmentation?.translation) === Boolean(segmentation?.translation) &&
                JSON.stringify(savedSegmentation?.segments) === JSON.stringify(segmentation?.segments)) {
                cache.delete(key);
            }
        }
    }
    activeExplanationKey = null;
    selectedRange = null;
    clearTimeout(selectionTimer);
    selectionTimer = undefined;
    startedInTranscript = false;
    window.getSelection()?.removeAllRanges();
    hideExplanation();
    selectedElement.textContent = responseElement.textContent = "";
    savedMarks = [];
    if (window.CSS?.highlights) CSS.highlights.delete("saved-terms");
    refreshSavedMarks();
    persistExplanations();
});

function updateLanguages() {
    explanationRequest++;
    activeExplanationKey = null;
    selectedRange = null;
    clearTimeout(selectionTimer);
    selectionTimer = undefined;
    startedInTranscript = false;
    window.getSelection()?.removeAllRanges();
    hideExplanation();
    applyTranslations();
    translateCompletedSegments();
    refreshSavedMarks();
    persistExplanations();
}

inputLanguageSelect.addEventListener("change", updateLanguages);
userLanguageSelect.addEventListener("change", updateLanguages);

{
    const settingsMenu = document.querySelector(".settings-menu");
    if (settingsMenu) {
        document.addEventListener("click", event => {
            if (!settingsMenu.contains(event.target)) settingsMenu.open = false;
        });
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape" || !settingsMenu.open) return;
            settingsMenu.open = false;
            settingsMenu.querySelector("summary").focus();
        });
    }
}
