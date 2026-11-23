const correctionToggle = document.getElementById("sentence-correction");
const correctionPending = document.getElementById("correction-pending");
const correctionPreferenceKey = "galpi_sentence_correction";
let correctionEnabled = true;
try { correctionEnabled = localStorage.getItem(correctionPreferenceKey) !== "false"; } catch {}
correctionToggle.checked = correctionEnabled;
correctionToggle.addEventListener("change", () => {
    correctionEnabled = correctionToggle.checked;
    try { localStorage.setItem(correctionPreferenceKey, String(correctionEnabled)); } catch {}
    if (!correctionEnabled) correctionWaiting = false;
    showCorrectionPending();
});
let correctionQueue = Promise.resolve();
let correctionEpoch = 0;
let correctionCount = 0;
let activeCorrection;
let correctionWaiting = false;
window.isSentenceCorrectionEnabled = () => correctionEnabled;
window.flushTranscriptCorrections = () => correctionQueue;
window.hasPendingTranscriptCorrections = () => correctionCount > 0;
function showCorrectionPending() {
    correctionPending.hidden = correctionCount === 0 && !correctionWaiting;
    correctionPending.textContent = t(correctionCount > 0 ? "correctingSentence" : "awaitingSpeechFinal");
}
window.showTranscriptCorrectionWaiting = waiting => {
    correctionWaiting = correctionEnabled && waiting;
    showCorrectionPending();
};
window.queueTranscriptCorrection = (text, commit) => {
    const enabled = correctionEnabled;
    if (!enabled && correctionCount === 0) { commit(text); return; }
    const epoch = correctionEpoch;
    const generation = storageGeneration;
    correctionCount++;
    showCorrectionPending();
    correctionQueue = correctionQueue.then(async () => {
        if (epoch !== correctionEpoch || generation !== storageGeneration) return;
        let corrected = text;
        if (enabled) {
            const controller = new AbortController();
            activeCorrection = controller;
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
                const context = Array.from(finalElement.querySelectorAll(".segment"), node => node.textContent)
                    .slice(-6).join("\n").slice(-12000);
                const response = await fetch("/api/sentence/correct", {
                    method: "POST", credentials: "same-origin", signal: controller.signal,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sentence: text, context })
                });
                if (!response.ok) throw new Error("HTTP " + response.status);
                const result = await response.json();
                if (typeof result.correctedSentence !== "string" || !result.correctedSentence.trim()) {
                    throw new Error("Empty correction");
                }
                corrected = result.correctedSentence.trim();
            } catch (error) { console.error("Sentence correction; preserving original:", error); }
            finally { clearTimeout(timer); if (activeCorrection === controller) activeCorrection = null; }
        }
        if (epoch === correctionEpoch && generation === storageGeneration) commit(corrected);
    }).catch(error => console.error("Transcript commit:", error)).finally(() => {
        if (epoch === correctionEpoch) { correctionCount--; showCorrectionPending(); }
    });
};
clearBtn.addEventListener("click", () => {
    correctionEpoch++;
    correctionCount = 0;
    correctionWaiting = false;
    activeCorrection?.abort();
    correctionQueue = Promise.resolve();
    showCorrectionPending();
});
userLanguageSelect.addEventListener("change", showCorrectionPending);
