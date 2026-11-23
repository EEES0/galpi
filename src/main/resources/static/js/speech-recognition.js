if (!SpeechRecognition) {
    setRecognitionStatus("unsupported");
    startBtn.disabled = true;
} else {
    let recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let shouldListen = false;
    let isRunning = false;
    let isStarting = false;
    let endStatusTimer;
    let stopTimer;
    let stopWaiters = [];
    const INTERIM_COMMIT_LENGTH = 50;
    const resultProgress = new Map();
    let restartTimer;
    let retryDelay = 500;
    let restartAttempts = 0;
    let recognitionFailed = false;
    const MAX_RESTART_ATTEMPTS = 5;

    function showStoppedStatus() {
        startBtn.setAttribute("aria-pressed", "false");
        document.body.classList.remove("listening");
        setRecognitionStatus(recognitionFailed ? "recognitionError" : "ended");
        clearTimeout(endStatusTimer);
        if (!recognitionFailed) {
            endStatusTimer = setTimeout(() => {
                if (!shouldListen) setRecognitionStatus("start");
            }, 1000);
        }
    }

    function requestStop() {
        if (stopTimer) return;
        // Some engines delay or omit end after stop. Retire that instance so
        // late events cannot modify a restarted session or another page.
        stopTimer = setTimeout(() => {
            const previous = recognition;
            const next = new SpeechRecognition();
            next.continuous = true;
            next.interimResults = true;
            next.maxAlternatives = 1;
            next.lang = previous.lang;
            for (const name of ["onstart", "onresult", "onerror", "onend"]) {
                next[name] = previous[name];
                previous[name] = null;
            }
            recognition = next;
            try { previous.abort(); } catch (error) { console.error(error); }
            recognition.onend();
        }, 2000);
        try { recognition.stop(); } catch (error) { console.error(error); }
    }

    function saveTranscript(text) {
        if (!text.trim()) return;
        const language = recognition.lang;
        const timestamp = new Date().toISOString();
        const commit = corrected => {
            const paragraph = appendSegment(corrected, language, timestamp);
            translateSegment(paragraph);
            refreshSavedMarks();
            persistExplanations();
        };
        if (window.queueTranscriptCorrection) window.queueTranscriptCorrection(text.trim(), commit);
        else commit(text.trim());
    }

    function flushInterim() {
        for (const progress of resultProgress.values()) {
            if (!progress.final) saveTranscript(progress.text.slice(progress.committed));
        }
        resultProgress.clear();
        interimElement.textContent = "";
    }

    function scheduleRestart() {
        clearTimeout(restartTimer);
        if (!shouldListen) return;
        if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
            shouldListen = false;
            recognitionFailed = true;
            showStoppedStatus();
            return;
        }
        restartAttempts++;
        setRecognitionStatus("reconnecting");
        restartTimer = setTimeout(startRecognition, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10000);
    }
    window.stopPageRecognition = async () => {
        shouldListen = false;
        clearTimeout(restartTimer);
        showStoppedStatus();
        if (!isRunning && !isStarting) {
            await window.flushTranscriptCorrections?.();
            return;
        }
        await new Promise(resolve => {
            stopWaiters.push(resolve);
            if (isRunning || isStarting) requestStop();
        });
        await window.flushTranscriptCorrections?.();
    };

    function startRecognition() {
        if (isRunning || isStarting || !shouldListen) return;

        recognition.lang = inputLanguageSelect.value;
        interimElement.lang = recognition.lang;

        try {
            isStarting = true;
            recognition.start();
        } catch (error) {
            isStarting = false;
            console.error(error);
            if (["NotAllowedError", "SecurityError", "NotSupportedError"].includes(error.name)) {
                shouldListen = false;
                recognitionFailed = true;
                showStoppedStatus();
            } else {
                scheduleRestart();
            }
        }
    }

    startBtn.addEventListener("click", () => {
        clearTimeout(endStatusTimer);
        shouldListen = !shouldListen;
        startBtn.setAttribute("aria-pressed", String(shouldListen));
        if (shouldListen) {
            restartAttempts = 0;
            retryDelay = 500;
            recognitionFailed = false;
            setRecognitionStatus("listening");
            startRecognition();
        } else {
            clearTimeout(restartTimer);
            showStoppedStatus();
            if (isRunning || isStarting) requestStop();
        }
    });

    inputLanguageSelect.addEventListener("change", () => {
        if (isRunning) {
            requestStop();
        } else if (shouldListen) {
            startRecognition();
        }
    });

    clearBtn.addEventListener("click", () => {
        // Discard already received hypotheses, including their later final updates.
        for (const progress of resultProgress.values()) progress.committed = progress.text.length;
        finalElement.textContent = "";
        interimElement.textContent = "";
        selectedElement.textContent = "";
        responseElement.textContent = "";
    });


    recognition.onstart = () => {
        isStarting = false;
        clearTimeout(endStatusTimer);
        isRunning = true;
        document.body.classList.add("listening");
        startBtn.setAttribute("aria-pressed", String(shouldListen));
        if (!shouldListen) {
            showStoppedStatus();
            requestStop();
        } else {
            setRecognitionStatus("listening");
        }
    };

    recognition.onresult = (event) => {
        retryDelay = 500;
        restartAttempts = 0;
        let interimText = "";
        for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            let progress = resultProgress.get(i);
            if (!progress) {
                progress = { text: "", committed: 0, final: false };
                resultProgress.set(i, progress);
            }
            if (progress.final) continue;
            progress.text = result[0].transcript;
            let remaining = progress.text.slice(progress.committed);
            if (result.isFinal) {
                saveTranscript(remaining);
                progress.committed = progress.text.length;
                progress.final = true;
            } else {
                // Freeze displayed prefixes locally; the API's isFinal is read-only.
                while (!window.isSentenceCorrectionEnabled?.() && Array.from(remaining).length >= INTERIM_COMMIT_LENGTH) {
                    const chunk = Array.from(remaining).slice(0, INTERIM_COMMIT_LENGTH).join("");
                    saveTranscript(chunk);
                    progress.committed += chunk.length;
                    remaining = progress.text.slice(progress.committed);
                }
                interimText += remaining;
            }
        }
        // Interim hypotheses can be removed or replaced by the recognition service.
        for (const index of resultProgress.keys()) {
            if (index >= event.results.length) resultProgress.delete(index);
        }
        interimElement.textContent = interimText;
    };

    recognition.onerror = (event) => {
        console.error("STT Error:", event.error);
        setRecognitionStatus("recognitionError");

        if ([
            "not-allowed",
            "service-not-allowed",
            "audio-capture",
            "language-not-supported"
        ].includes(event.error)) {
            shouldListen = false;
            recognitionFailed = true;
            clearTimeout(restartTimer);
            showStoppedStatus();
        }
    };

    recognition.onend = () => {
        clearTimeout(stopTimer);
        stopTimer = undefined;
        isStarting = false;
        isRunning = false;
        flushInterim();
        stopWaiters.splice(0).forEach(resolve => resolve());
        document.body.classList.remove("listening");
        interimElement.textContent = "";

        if (shouldListen) {
            scheduleRestart();
        } else {
            startBtn.disabled = false;
            showStoppedStatus();
        }
    };
}
