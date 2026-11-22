if (!SpeechRecognition) {
    setRecognitionStatus("unsupported");
    startBtn.disabled = true;
} else {
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let shouldListen = false;
    let isRunning = false;
    let isStarting = false;
    let endStatusTimer;
    let stopWaiters = [];
    const INTERIM_COMMIT_LENGTH = 50;
    const resultProgress = new Map();
    let restartTimer;
    let retryDelay = 500;

    function saveTranscript(text) {
        if (!text.trim()) return;
        const paragraph = appendSegment(text.trim(), recognition.lang, new Date().toISOString());
        translateSegment(paragraph);
        refreshSavedMarks();
        persistExplanations();
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
        setRecognitionStatus("reconnecting");
        restartTimer = setTimeout(startRecognition, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10000);
    }
    window.stopPageRecognition = () => {
        shouldListen = false;
        clearTimeout(restartTimer);
        if (!isRunning && !isStarting) return Promise.resolve();
        return new Promise(resolve => {
            stopWaiters.push(resolve);
            if (isRunning) recognition.stop();
        });
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
            scheduleRestart();
        }
    }

    startBtn.addEventListener("click", () => {
        clearTimeout(endStatusTimer);
        shouldListen = !shouldListen;
        startBtn.setAttribute("aria-pressed", String(shouldListen));
        if (shouldListen) {
            setRecognitionStatus("listening");
            startRecognition();
        } else {
            clearTimeout(restartTimer);
            setRecognitionStatus("ended");
            if (isRunning) recognition.stop();
        }
    });

    inputLanguageSelect.addEventListener("change", () => {
        if (isRunning) {
            recognition.stop();
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
        isStarting = false;가
        clearTimeout(endStatusTimer);
        isRunning = true;
        document.body.classList.add("listening");
        startBtn.setAttribute("aria-pressed", String(shouldListen));
        setRecognitionStatus("listening");
        if (!shouldListen) recognition.stop();
    };

    recognition.onresult = (event) => {
        retryDelay = 500;
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
                while (Array.from(remaining).length >= INTERIM_COMMIT_LENGTH) {
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
        }
    };

    recognition.onend = () => {
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
            startBtn.setAttribute("aria-pressed", "false");
            setRecognitionStatus("ended");
            clearTimeout(endStatusTimer);
            endStatusTimer = setTimeout(() => {
                if (!shouldListen && !isRunning) {
                    setRecognitionStatus("start");
                }
            }, 1000);
        }
    };
}
