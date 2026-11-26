(() => {
    const sidebar = document.getElementById("page-sidebar");
    const menu = document.getElementById("menu-toggle");
    const close = document.getElementById("menu-close");
    const backdrop = document.getElementById("drawer-backdrop");
    const mobile = window.matchMedia("(max-width: 640px)");
    let scrollFrame;

    function updateContentActions() {
        const hasFinal = Array.from(finalElement.querySelectorAll(".segment"))
            .some(node => node.textContent.trim());
        const hasContent = hasFinal || Boolean(interimElement.textContent.trim());
        document.getElementById("transcript-placeholder").hidden = hasContent;
        summaryTab.disabled = !hasFinal;
        clearBtn.disabled = !hasContent;
        copyContentButton.disabled = !hasContent || !contentToCopy();
        if (!hasFinal && !summaryPanel.hidden) selectContentTab(transcriptTab);
    }

    clearBtn.addEventListener("click", event => {
        if (clearBtn.disabled || !window.confirm(t("confirmClear"))) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);

    function setDrawer(open, restoreFocus = true) {
        const expanded = open && mobile.matches;
        document.body.classList.toggle("drawer-open", expanded);
        menu.setAttribute("aria-expanded", String(expanded));
        backdrop.hidden = !expanded;
        sidebar.inert = mobile.matches && !expanded;
        if (expanded) close.focus();
        else if (restoreFocus && mobile.matches) menu.focus();
    }
    menu.addEventListener("click", () => setDrawer(menu.getAttribute("aria-expanded") !== "true"));
    close.addEventListener("click", () => setDrawer(false));
    backdrop.addEventListener("click", () => setDrawer(false));
    sidebar.addEventListener("click", event => {
        if (event.target.closest(".saved-page, .new-page")) setDrawer(false);
    });
    document.addEventListener("keydown", event => {
        if (menu.getAttribute("aria-expanded") !== "true") return;
        if (event.key === "Escape") { event.preventDefault(); setDrawer(false); }
        if (event.key === "Tab") {
            const buttons = [...sidebar.querySelectorAll("button:not(:disabled), [href], input, select")]
                .filter(node => node.getClientRects().length);
            const first = buttons[0], last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    mobile.addEventListener("change", () => setDrawer(false, false));
    setDrawer(false, false);

    const latestButton = document.getElementById("latest-script");
    function latestScriptNode() {
        return interimElement.textContent.trim() ? interimElement : Array.from(finalElement.querySelectorAll(".segment")).at(-1);
    }
    function updateLatestButton() {
        scrollFrame = null;
        const latest = latestScriptNode();
        const viewport = window.visualViewport;
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const lineHeight = latest ? parseFloat(getComputedStyle(latest).lineHeight) || 32 : 32;
        latestButton.hidden = !latest || transcriptPanel.hidden || transcriptEditing
            || latest.getBoundingClientRect().bottom - bottom < lineHeight * 2;
    }
    function scheduleLatestButton() {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(updateLatestButton);
    }
    latestButton.addEventListener("click", () => {
        const latest = latestScriptNode();
        if (!latest) return;
        latest.scrollIntoView({ block: "end", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    window.addEventListener("scroll", scheduleLatestButton, { passive: true });
    window.addEventListener("resize", scheduleLatestButton);
    window.visualViewport?.addEventListener("resize", scheduleLatestButton);
    window.visualViewport?.addEventListener("scroll", scheduleLatestButton);
    document.addEventListener("focusin", scheduleLatestButton);
    document.addEventListener("focusout", scheduleLatestButton);
    const observer = new MutationObserver(() => {
        updateContentActions();
        scheduleLatestButton();
    });
    for (const node of [finalElement, interimElement, summaryPanel]) {
        observer.observe(node, { childList: true, characterData: true, subtree: true,
            attributes: true, attributeFilter: ["hidden"] });
    }
    observer.observe(transcriptPanel, { attributes: true, attributeFilter: ["hidden"] });
    updateContentActions();
    scheduleLatestButton();
})();
