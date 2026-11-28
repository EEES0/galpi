let currentPage = null;
let pageSummaries = [];
let pagesReady = false;
let pageNavigationBusy = false;
let pageSaveTimer;
let pageSavePromise = null;
let pageChangeNumber = 0;
let pageSavedNumber = 0;
let pageSaveConflict = false;
let pageInitializationPending = false;
let pendingWelcomePage = null;
const pageTitle = document.querySelector(".page-title");
const newPageButton = document.querySelector(".new-page");
const pageList = document.getElementById("page-list");
const pageSavedChecks = new Map();
const userLanguagePreferenceKey = "galpi-user-language";
let preferredUserLanguage = null;
try {
    const saved = localStorage.getItem(userLanguagePreferenceKey);
    if (supportedLanguages.has(saved)) {
        preferredUserLanguage = saved;
        userLanguageSelect.value = saved;
    }
} catch {}
userLanguageSelect.addEventListener("change", () => {
    preferredUserLanguage = userLanguageSelect.value;
    try { localStorage.setItem(userLanguagePreferenceKey, preferredUserLanguage); } catch {}
});

function setPageSavedState(saved) {
    const check = pageSavedChecks.get(currentPage?.id);
    if (check) check.hidden = !saved;
}

async function pageRequest(path = "", options = {}) {
    const response = await fetch("/api/pages" + path, {
        credentials: "same-origin", ...options,
        headers: { "Content-Type": "application/json", ...options.headers }
    });
    if (!response.ok) {
        const error = new Error("HTTP " + response.status);
        error.status = response.status;
        throw error;
    }
    return response.status === 204 ? null : response.json();
}

function renderPageList() {
    pageList.replaceChildren();
    pageSavedChecks.clear();
    for (const page of pageSummaries) {
        const row = document.createElement("div");
        row.className = "saved-page-row";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "saved-page";
        const title = document.createElement("span");
        title.className = "saved-page-title";
        title.textContent = page.title || t("untitled");
        const check = document.createElement("span");
        check.className = "page-saved-check";
        check.setAttribute("role", "img");
        check.setAttribute("aria-label", t("saved"));
        check.setAttribute("data-tooltip", t("saved"));
        check.hidden = page.id === currentPage?.id && (pageChangeNumber !== pageSavedNumber || pageSaveConflict);
        check.innerHTML = '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="currentColor" opacity=".1"/><path d="m6 10 2.5 2.5L14 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        pageSavedChecks.set(page.id, check);
        button.append(title);
        button.append(check);
        button.setAttribute("aria-current", String(page.id === currentPage?.id));
        button.disabled = pageNavigationBusy;
        button.addEventListener("click", () => navigatePage(page.id));
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-page";
        deleteButton.setAttribute("aria-label", t("deletePage") + ": " + (page.title || t("untitled")));
        deleteButton.title = t("deletePage");
        deleteButton.disabled = pageNavigationBusy;
        deleteButton.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
        deleteButton.addEventListener("click", () => deletePage(page.id));
        row.append(button);
        row.append(deleteButton);
        pageList.append(row);
    }
}

function lockPageEditor(locked) {
    document.querySelector("main").inert = locked;
    explanation.inert = locked;
    newPageButton.disabled = locked;
    for (const button of pageList.querySelectorAll("button")) button.disabled = locked;
}

function resetPageEditor() {
    setTranscriptEditing(false);
    storageGeneration++;
    explanationRequest++;
    for (const pending of pendingSegmentTranslations.values()) pending.controller.abort();
    pendingSegmentTranslations.clear();
    savedExplanations.clear();
    pendingExplanations.clear();
    requestedExplanations.clear();
    translatedSegments.clear();
    savedMarks = [];
    selectedRange = null;
    activeExplanationKey = null;
    clearTimeout(selectionTimer);
    startedInTranscript = false;
    window.getSelection()?.removeAllRanges();
    hideExplanation();
    selectedElement.textContent = responseElement.textContent = "";
    finalElement.textContent = interimElement.textContent = "";
    if (window.CSS?.highlights) CSS.highlights.delete("saved-terms");
}

function displayPage(page) {
    pagesReady = false;
    resetPageEditor();
    currentPage = page;
    window.resetPageSummary?.();
    pageTitle.value = page.title;
    inputLanguageSelect.value = "ko-KR";
    userLanguageSelect.value = "ko-KR";
    restoreExplanations(page.state);
    // The interface language follows the user's preference, not each page's snapshot.
    if (preferredUserLanguage) userLanguageSelect.value = preferredUserLanguage;
    preferredUserLanguage = userLanguageSelect.value;
    pageChangeNumber = pageSavedNumber = 0;
    pageSaveConflict = false;
    pagesReady = true;
    applyTranslations();
    refreshSavedMarks();
    translateCompletedSegments();
    renderPageList();
    setPageSavedState(pageChangeNumber === pageSavedNumber);
}

function schedulePageSave() {
    if (!pagesReady || !currentPage || pageSaveConflict) return;
    pageChangeNumber++;
    setPageSavedState(false);
    clearTimeout(pageSaveTimer);
    pageSaveTimer = setTimeout(() => flushPageSave().catch(reportPageError), 500);
}

async function flushPageSave() {
    clearTimeout(pageSaveTimer);
    if (pageSavePromise) await pageSavePromise;
    if (pageSaveConflict) throw new Error("conflict");
    if (!currentPage || pageSavedNumber === pageChangeNumber) return;
    const run = async () => {
        // Serialize saves so a slower earlier request cannot overwrite newer content.
        while (pageSavedNumber !== pageChangeNumber) {
            const revision = pageChangeNumber;
            setPageSavedState(false);
            const body = JSON.stringify({ title: pageTitle.value, state: capturePageState(), version: currentPage.version });
            const saved = await pageRequest("/" + currentPage.id, {
                method: "PUT",
                body,
                // Browsers cap keepalive request bodies at roughly 64 KiB.
                keepalive: document.visibilityState === "hidden" && new TextEncoder().encode(body).length < 60000
            });
            currentPage.version = saved.version;
            currentPage.title = saved.title;
            pageSavedNumber = revision;
            const summary = pageSummaries.find(p => p.id === currentPage.id);
            if (summary) summary.title = saved.title;
            renderPageList();
        }
        setPageSavedState(true);
    };
    pageSavePromise = run();
    try { await pageSavePromise; }
    finally { pageSavePromise = null; }
}

function reportPageError(error) {
    console.error("Page persistence:", error);
    setPageSavedState(false);
    if (error.status === 409 || error.message === "conflict") {
        pageSaveConflict = true;
    }
}

async function navigatePage(id = null) {
    if (!pagesReady || pageNavigationBusy || id === currentPage?.id) return;
    pageNavigationBusy = true;
    lockPageEditor(true);
    try {
        await window.stopPageRecognition?.();
        // Stop responses for the old page before capturing its final state.
        storageGeneration++;
        explanationRequest++;
        for (const pending of pendingSegmentTranslations.values()) pending.controller.abort();
        pendingSegmentTranslations.clear();
        pendingExplanations.clear();
        requestedExplanations.clear();
        await flushPageSave();
        const page = await pageRequest(id ? "/" + id : "", id ? {} : { method: "POST" });
        if (!id) pageSummaries.unshift({ id: page.id, title: page.title });
        displayPage(page);
    } catch (error) { reportPageError(error); }
    finally {
        pageNavigationBusy = false;
        lockPageEditor(false);
    }
}

async function initializePages({ createWelcome = true } = {}) {
    if (pageInitializationPending) return;
    pageInitializationPending = true;
    const status = document.getElementById("page-load-status");
    const message = document.getElementById("page-load-message");
    const retry = document.getElementById("page-load-retry");
    status.hidden = false;
    message.dataset.i18n = "pageLoading";
    message.textContent = t("pageLoading");
    message.setAttribute("aria-busy", "true");
    retry.hidden = true;
    lockPageEditor(true);
    setPageSavedState(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        pageSummaries = await pageRequest("", { signal: controller.signal });
        let page = pendingWelcomePage || (pageSummaries.length
            ? await pageRequest("/" + pageSummaries[0].id, { signal: controller.signal })
            : await pageRequest("", { method: "POST", signal: controller.signal }));
        if (pendingWelcomePage || (!pageSummaries.length && createWelcome)) {
            // Keep the created page for retries if saving the welcome content fails.
            pendingWelcomePage = page;
            page = await pageRequest("/" + page.id, {
                method: "PUT", signal: controller.signal,
                body: JSON.stringify({ title: welcomePageTitle, state: welcomePageState(), version: page.version })
            });
            pendingWelcomePage = null;
        }
        const summary = pageSummaries.find(summary => summary.id === page.id);
        if (summary) summary.title = page.title;
        else pageSummaries.push({ id: page.id, title: page.title });
        displayPage(page);
        lockPageEditor(false);
        status.hidden = true;
    } catch (error) {
        reportPageError(error);
        message.dataset.i18n = controller.signal.aborted ? "pageLoadTimeout" : "pageLoadError";
        message.textContent = t(message.dataset.i18n);
        retry.hidden = false;
    } finally {
        message.setAttribute("aria-busy", "false");
        clearTimeout(timeout);
        pageInitializationPending = false;
    }
}

document.getElementById("page-load-retry").addEventListener("click", () => initializePages());

async function deletePage(id) {
    if (!pagesReady || pageNavigationBusy) return;
    const deletingCurrent = id === currentPage?.id;
    let deleted = false;
    pageNavigationBusy = true;
    lockPageEditor(true);
    try {
        if (deletingCurrent) {
            await window.stopPageRecognition?.();
            pagesReady = false;
            clearTimeout(pageSaveTimer);
            storageGeneration++;
            explanationRequest++;
            for (const pending of pendingSegmentTranslations.values()) pending.controller.abort();
            pendingSegmentTranslations.clear();
            pendingExplanations.clear();
            requestedExplanations.clear();
            // Finish any already-sent save before deleting; unsaved changes are discarded with the page.
            if (pageSavePromise) await pageSavePromise.catch(() => {});
        }
        await pageRequest("/" + id, { method: "DELETE" });
        deleted = true;
        pageSummaries = pageSummaries.filter(page => page.id !== id);
        if (deletingCurrent) {
            resetPageEditor();
            currentPage = null;
            pageTitle.value = "";
            pageChangeNumber = pageSavedNumber = 0;
            setPageSavedState(false);
            // Re-read the list so pages removed in another tab are excluded as well.
            // Deleting the last page must not immediately recreate the welcome page.
            await initializePages({ createWelcome: false });
        } else {
            renderPageList();
        }
    } catch (error) {
        if (!deleted && deletingCurrent) pagesReady = true;
        reportPageError(error);
    } finally {
        pageNavigationBusy = false;
        lockPageEditor(!pagesReady);
    }
}

pageTitle.addEventListener("input", schedulePageSave);
newPageButton.addEventListener("click", () => navigatePage());
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pagesReady) flushPageSave().catch(reportPageError);
});
window.addEventListener("beforeunload", event => {
    if (pageChangeNumber !== pageSavedNumber || window.hasPendingTranscriptCorrections?.()) {
        event.preventDefault();
        event.returnValue = "";
    }
});
