function refreshSavedMarks() {
    savedMarks = [];
    const entries = new Map([...requestedExplanations, ...savedExplanations]);
    for (const entry of entries.values()) {
        if (entry.userLanguage !== userLanguageSelect.value || !entry.term) continue;
        const saved = entry.segmentation;
        const root = saved.summary ? summaryElement : finalElement;
        const segments = Array.from(root.querySelectorAll(saved.summary ? ".summary-segment"
            : saved.translation ? ".segment-translation" : ".segment"));
        for (let index = 0; index <= segments.length - saved.segments.length; index++) {
            if (!saved.segments.every((text, step) => segments[index + step].textContent === text &&
                (segments[index + step].dataset.inputLanguage || "ko-KR") === saved.languages[step])) continue;
            const first = segments[index];
            const last = segments[index + saved.segments.length - 1];
            if (!first.firstChild || !last.firstChild || saved.startOffset < 0 || saved.endOffset < 0 ||
                saved.startOffset > first.textContent.length || saved.endOffset > last.textContent.length) continue;
            if (segmentationText(saved) !== entry.term) continue;
            for (let step = 0; step < saved.segments.length; step++) {
                const segment = segments[index + step];
                if (!segment.firstChild) continue;
                const range = document.createRange();
                range.setStart(segment.firstChild, step === 0 ? saved.startOffset : 0);
                range.setEnd(segment.firstChild, step === saved.segments.length - 1
                    ? saved.endOffset : segment.textContent.length);
                if (!range.collapsed) savedMarks.push({ range, entry });
            }
        }
    }
    if (window.CSS?.highlights && window.Highlight) {
        CSS.highlights.set("saved-terms", new Highlight(...savedMarks.map(mark => mark.range)));
    }
}

function renderExplanation(data) {
    responseElement.replaceChildren();
    const text = value => typeof value === "string" ? value.trim() : "";
    const originalTerm = text(data?.term);
    if (originalTerm) selectedElement.textContent = originalTerm;
    const translation = text(data?.translation);
    const description = text(data?.description);
    const example = text(data?.example);

    function appendText(content, className) {
        const paragraph = document.createElement("p");
        paragraph.className = className;
        paragraph.textContent = content;
        responseElement.appendChild(paragraph);
    }

    appendText(translation || t("noTranslation"), "term-translation");
    appendText(description || t("noDescription"), "term-description");

    if (example) {
        const exampleSection = document.createElement("pre");
        exampleSection.className = "term-example";
        exampleSection.setAttribute("aria-label", t("example"));
        const content = document.createElement("code");
        content.textContent = example.replace(/^(?:```|''')[^\n]*\n([\s\S]*?)\n(?:```|''')$/, "$1");
        exampleSection.append(content);
        responseElement.appendChild(exampleSection);
    }
}

function renderEntry(entry) {
    selectedElement.lang = entry.inputLanguage;
    responseElement.lang = entry.userLanguage;
    if (entry.data) {
        renderExplanation(entry.data);
    } else {
        responseElement.textContent = entry.error
            ? t("requestError")
            : t("loading");
    }
}

function hideExplanation() {
    explanation.hidden = true;
}
function showExplanation() {
    if (!selectedRange) return;
    const rect = selectedRange.getBoundingClientRect();
    explanation.hidden = false;
    const width = explanation.offsetWidth;
    const height = explanation.offsetHeight;
    explanation.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)) + "px";
    const below = rect.bottom + 10;
    explanation.style.top = Math.max(16, Math.min(below + height <= window.innerHeight - 16 ? below : rect.top - height - 10, window.innerHeight - height - 16)) + "px";
}
document.addEventListener("pointerdown", event => {
    if (!explanation.contains(event.target)) hideExplanation();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape") hideExplanation();
});
window.addEventListener("resize", hideExplanation);
window.addEventListener("scroll", hideExplanation, { passive: true });
function hoverSavedExplanation(event) {
    if (startedInTranscript || event.buttons || selectionTimer !== undefined) return;
    const mark = savedMarks.find(mark => Array.from(mark.range.getClientRects()).some(rect =>
        event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom));
    if (!mark) return;
    explanationRequest++;
    selectedRange = mark.range;
    activeExplanationKey = termKey(mark.entry.term, mark.entry.context, mark.entry.segmentation,
        mark.entry.inputLanguage, mark.entry.userLanguage);
    selectedElement.textContent = mark.entry.term;
    renderEntry(mark.entry);
    showExplanation();
}
finalElement.addEventListener("pointermove", hoverSavedExplanation);
summaryElement.addEventListener("pointermove", hoverSavedExplanation);

async function sendSelection(selectedTerm, context, segmentation) {
    explanationRequest++;
    const key = termKey(selectedTerm, context, segmentation);
    activeExplanationKey = key;
    const inputLanguage = segmentation.languages[0];
    const userLanguage = userLanguageSelect.value;
    selectedElement.lang = inputLanguage;
    responseElement.lang = userLanguage;
    const generation = storageGeneration;
    const cached = savedExplanations.get(key);
    if (cached) {
        renderExplanation(cached.data);
        refreshSavedMarks();
        showExplanation();
        return;
    }
    const payload = {
        selectedTerm: selectedTerm,
        context: context,
        inputLanguage,
        userLanguage
    };
    let requestEntry = requestedExplanations.get(key);
    if (!requestEntry || requestEntry.error) {
        requestEntry = { term: selectedTerm, inputLanguage, userLanguage, context, segmentation };
        requestedExplanations.set(key, requestEntry);
    }
    refreshSavedMarks();

    try {
        responseElement.textContent = t("loading");

        let pending = pendingExplanations.get(key);
        if (!pending) {
            pending = (async () => {
                const response = await fetch(API_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error("HTTP " + response.status);
                }

                const data = await response.json();
                if (!data || typeof data.description !== "string" || !data.description.trim()) {
                    throw new Error("Invalid explanation response");
                }
                if (generation !== storageGeneration || pendingExplanations.get(key) !== pending) return null;
                savedExplanations.set(key, {
                    term: selectedTerm,
                    inputLanguage,
                    userLanguage,
                    context,
                    segmentation,
                    data: {
                        term: typeof data.term === "string" && data.term.trim() ? data.term : selectedTerm,
                        translation: typeof data.translation === "string" ? data.translation : "",
                        description: data.description,
                        example: typeof data.example === "string" ? data.example : ""
                    }
                });
                requestedExplanations.delete(key);
                persistExplanations();
                refreshSavedMarks();
                return savedExplanations.get(key).data;
            })().finally(() => {
                if (pendingExplanations.get(key) === pending) pendingExplanations.delete(key);
            });
            pendingExplanations.set(key, pending);
        }
        const data = await pending;

        if (!data || activeExplanationKey !== key || startedInTranscript) return;
        renderExplanation(data);
        if (!explanation.hidden) showExplanation();

    } catch (error) {
        if (generation !== storageGeneration || requestedExplanations.get(key) !== requestEntry) return;
        requestEntry.error = true;
        refreshSavedMarks();
        if (activeExplanationKey !== key || startedInTranscript) return;
        console.error("API Error:", error);
        responseElement.textContent = t("requestError");
        if (!explanation.hidden) showExplanation();
    }
}
