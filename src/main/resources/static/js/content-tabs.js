const transcriptTab = document.getElementById("transcript-tab");
const summaryTab = document.getElementById("summary-tab");
const transcriptPanel = document.getElementById("transcript");
const summaryPanel = document.getElementById("page-summary");
const summaryCache = new Map();
const pendingSummaries = new Map();
let summaryViewRequest = 0;
let summaryAutoRefreshEnabled = false;
let summaryRefreshTimer;
let observedSummarySource;
let summaryRefreshDeferred = false;

function scheduleSummaryRefresh() {
    clearTimeout(summaryRefreshTimer);
    if (!summaryAutoRefreshEnabled || !pagesReady || !currentPage || pageNavigationBusy) return;
    summaryRefreshDeferred = true;
    if (!summaryPanel.hidden) return;
    summaryRefreshTimer = setTimeout(() => {
        summaryRefreshTimer = undefined;
        if (!summaryAutoRefreshEnabled || !pagesReady || !currentPage || pageNavigationBusy) return;
        if (!summaryPanel.hidden) return;
        // Let an in-flight generation finish before generating the latest transcript.
        // Its completion schedules another refresh if its source is now stale.
        if (pendingSummaries.size) return;
        return loadPageSummary();
    }, 1200);
}

function summarySourceKey() {
    return JSON.stringify([currentPage?.id, userLanguageSelect.value,
        Array.from(finalElement.querySelectorAll(".segment"), node => node.textContent.trim()).filter(Boolean)]);
}

function renderSummary(data) {
    summaryPanel.replaceChildren();
    summaryPanel.lang = data.targetLanguage;
    // Plain text nodes preserve safe, exact selection offsets and cannot execute returned markup.
    for (const text of data.summary.trim().split(/\n\s*\n/)) {
        const paragraph = document.createElement("p");
        paragraph.className = "summary-segment";
        paragraph.dataset.inputLanguage = data.targetLanguage;
        paragraph.textContent = text;
        summaryPanel.appendChild(paragraph);
    }
    refreshSavedMarks();
}

async function loadPageSummary() {
    if (!pagesReady || !currentPage || pageNavigationBusy) return;
    clearTimeout(summaryRefreshTimer);
    summaryAutoRefreshEnabled = true;
    summaryRefreshDeferred = false;
    const view = ++summaryViewRequest;
    const key = summarySourceKey();
    const pageId = currentPage.id;
    const language = userLanguageSelect.value;
    summaryPanel.setAttribute("aria-busy", "true");
    summaryPanel.dataset.failed = "false";
    summaryPanel.textContent = t("summaryLoading");
    try {
        let data = summaryCache.get(key);
        if (!data) {
            let pending = pendingSummaries.get(key);
            if (!pending) {
                const controller = new AbortController();
                pending = { controller, promise: null };
                pending.promise = (async () => {
                    // The summary service reads the DB transcript, so save pending edits first.
                    try {
                        await flushPageSave();
                    } catch (error) {
                        reportPageError(error);
                        throw error;
                    }
                    if (controller.signal.aborted || summarySourceKey() !== key) return null;
                    const path = "/" + encodeURIComponent(pageId) + "/summary";
                    let result;
                    try {
                        result = await pageRequest(path + "?targetLanguage=" + encodeURIComponent(language), {
                            signal: controller.signal
                        });
                    } catch (error) {
                        if (error.status !== 404) throw error;
                        result = await pageRequest(path, {
                            method: "POST", signal: controller.signal,
                            body: JSON.stringify({ targetLanguage: language, regenerate: false })
                        });
                    }
                    if (typeof result?.summary !== "string" || !result.summary.trim()
                        || result.pageId !== pageId || result.targetLanguage !== language) {
                        throw new Error("Invalid summary response");
                    }
                    if (controller.signal.aborted || summarySourceKey() !== key) return null;
                    summaryCache.set(key, result);
                    return result;
                })().finally(() => {
                    if (pendingSummaries.get(key) === pending) pendingSummaries.delete(key);
                    if (!controller.signal.aborted && currentPage?.id === pageId && summarySourceKey() !== key) {
                        scheduleSummaryRefresh();
                    }
                });
                pendingSummaries.set(key, pending);
            }
            data = await pending.promise;
        }
        if (view !== summaryViewRequest || summaryPanel.hidden || currentPage?.id !== pageId) return;
        if (!data || summarySourceKey() !== key) {
            summaryPanel.textContent = t("summaryChanged");
            return;
        }
        renderSummary(data);
    } catch (error) {
        if (view !== summaryViewRequest || summaryPanel.hidden || currentPage?.id !== pageId) return;
        summaryPanel.dataset.failed = "true";
        console.error("Summary:", error);
        summaryPanel.textContent = t(error.status === 409 ? "summaryChanged" : "summaryError");
    } finally {
        if (view === summaryViewRequest) summaryPanel.setAttribute("aria-busy", "false");
    }
}

function selectContentTab(tab) {
    const showSummary = tab === summaryTab;
    if (showSummary && !summaryPanel.hidden && summaryPanel.dataset.failed !== "true") return;
    transcriptTab.setAttribute("aria-selected", String(!showSummary));
    summaryTab.setAttribute("aria-selected", String(showSummary));
    transcriptTab.tabIndex = showSummary ? -1 : 0;
    summaryTab.tabIndex = showSummary ? 0 : -1;
    transcriptPanel.hidden = showSummary;
    summaryPanel.hidden = !showSummary;
    hideExplanation();
    selectedRange = null;
    activeExplanationKey = null;
    window.getSelection()?.removeAllRanges();
    if (showSummary) {
        loadPageSummary();
    } else {
        summaryViewRequest++;
        summaryPanel.setAttribute("aria-busy", "false");
        if (summaryRefreshDeferred) scheduleSummaryRefresh();
    }
}

for (const tab of [transcriptTab, summaryTab]) {
    tab.addEventListener("click", () => selectContentTab(tab));
    tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? transcriptTab : event.key === "End" ? summaryTab
            : tab === transcriptTab ? summaryTab : transcriptTab;
        selectContentTab(next);
        next.focus();
    });
}

window.resetPageSummary = () => {
    summaryAutoRefreshEnabled = false;
    summaryRefreshDeferred = false;
    clearTimeout(summaryRefreshTimer);
    summaryViewRequest++;
    for (const pending of pendingSummaries.values()) pending.controller.abort();
    pendingSummaries.clear();
    summaryCache.clear();
    summaryPanel.textContent = "";
    selectContentTab(transcriptTab);
    observedSummarySource = summarySourceKey();
};

observedSummarySource = summarySourceKey();
new MutationObserver(() => {
    const key = summarySourceKey();
    if (key === observedSummarySource) return;
    observedSummarySource = key;
    scheduleSummaryRefresh();
}).observe(finalElement, { childList: true, characterData: true, subtree: true });

userLanguageSelect.addEventListener("change", () => {
    if (!summaryPanel.hidden) {
        loadPageSummary();
        return;
    }
    scheduleSummaryRefresh();
});
clearBtn.addEventListener("click", window.resetPageSummary);

const copyContentButton = document.getElementById("copy-content");
const copyFeedback = document.getElementById("copy-feedback");
let copyFeedbackTimer;

function contentToCopy() {
    if (!summaryPanel.hidden) {
        return Array.from(summaryPanel.querySelectorAll(".summary-segment"), node => node.textContent.trim())
            .filter(Boolean).join("\n\n");
    }
    return [...Array.from(finalElement.querySelectorAll(".segment"), node => node.textContent.trim()),
        interimElement.textContent.trim()].filter(Boolean).join("\n\n");
}

function showCopyFeedback(key) {
    clearTimeout(copyFeedbackTimer);
    copyContentButton.dataset.i18nTitle = key;
    copyContentButton.title = t(key);
    copyFeedback.dataset.i18n = key;
    copyFeedback.textContent = t(key);
    copyContentButton.dataset.copied = String(key === "copied");
    copyFeedbackTimer = setTimeout(() => {
        copyContentButton.dataset.i18nTitle = "copyAll";
        copyContentButton.title = t("copyAll");
        copyContentButton.dataset.copied = "false";
        delete copyFeedback.dataset.i18n;
        copyFeedback.textContent = "";
    }, 2000);
}

copyContentButton.addEventListener("click", async () => {
    const text = contentToCopy();
    if (!text) { showCopyFeedback("nothingToCopy"); return; }
    try {
        await navigator.clipboard.writeText(text);
        showCopyFeedback("copied");
    } catch (error) {
        console.error("Copy:", error);
        showCopyFeedback("copyError");
    }
});
