document.addEventListener("pointerdown", event => {
    if (event.button !== 0 || explanation.contains(event.target)) return;
    startedInTranscript = true;
    clearTimeout(selectionTimer);
    selectionTimer = undefined;
    explanationRequest++;
}, true);

function scheduleSelection() {
    if (transcriptEditing) return;
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
        selectionTimer = undefined;
        if (startedInTranscript) return;
        const selection = window.getSelection();

        if (!selection || selection.isCollapsed || !selection.rangeCount) return;

        const range = selection.getRangeAt(0).cloneRange();

        const root = selectionRoot(range.startContainer);
        if (!root || root !== selectionRoot(range.endContainer)
            || (root === summaryElement ? root.hidden : document.getElementById("transcript").hidden)) {
            return;
        }

        const context = findContext(range);
        if (!context) return;
        const segmentation = getSegmentation(range);
        if (!segmentation) return;
        const selectedText = segmentationText(segmentation);
        if (!selectedText || selectedText.length > 100) return;

        selectedElement.textContent = selectedText;

        selectedRange = range.cloneRange();
        showExplanation();
        sendSelection(selectedText, context, segmentation);

    }, 0);
}

document.addEventListener("pointerup", event => {
    if (event.button !== 0 || !startedInTranscript) return;
    startedInTranscript = false;
    scheduleSelection();
});

document.addEventListener("pointercancel", () => {
    startedInTranscript = false;
    clearTimeout(selectionTimer);
    selectionTimer = undefined;
});
