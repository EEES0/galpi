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

    const observer = new MutationObserver(() => {
        updateContentActions();
        if (!document.body.classList.contains("listening") || transcriptPanel.hidden || transcriptEditing) return;
        cancelAnimationFrame(scrollFrame);
        scrollFrame = requestAnimationFrame(() => {
            const latest = interimElement.textContent.trim() ? interimElement : finalElement.lastElementChild;
            latest?.scrollIntoView({ block: "end", behavior: "auto" });
        });
    });
    for (const node of [finalElement, interimElement, summaryPanel]) {
        observer.observe(node, { childList: true, characterData: true, subtree: true,
            attributes: true, attributeFilter: ["hidden"] });
    }
    observer.observe(transcriptPanel, { attributes: true, attributeFilter: ["hidden"] });
    updateContentActions();
})();
