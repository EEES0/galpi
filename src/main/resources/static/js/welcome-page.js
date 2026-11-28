const welcomePageTitle = "👋 갈피에 오신 것을 환영합니다!";

function isWelcomePage(page) {
    return Boolean(page && [welcomePageTitle, "갈피에 오신 것을 환영합니다!"].includes(page.title)
        && page.state?.segments?.some(segment => /^(아래 내용을 확인해주세요|사용 방법)(?:\n|$)/.test(segment.text || "")));
}

let disposeWelcomeMotion = () => {};

function displayWelcomePage(page) {
    disposeWelcomeMotion();
    const article = document.getElementById("welcome-page");
    const welcome = isWelcomePage(page);
    document.body.classList.toggle("welcome-view", welcome);
    article.hidden = !welcome;
    article.replaceChildren();
    if (!welcome) return;
    const hero = document.createElement("header");
    hero.className = "welcome-hero";
    const bookmark = document.createElement("div");
    bookmark.className = "welcome-bookmark";
    bookmark.setAttribute("aria-hidden", "true");
    hero.append(bookmark);
    const title = document.createElement("h1");
    title.textContent = page.title;
    hero.append(title);
    article.append(hero);
    const majorHeadings = new Set(["개발 과정에서 겪은 문제 및 해결", "개선할 점", "기대 효과"]);
    const minorHeadings = new Set([
        "문맥에 맞지 않는 용어 설명을 제공하는 문제", "로그인 없는 사용자 식별",
        "반복적인 API 호출로 인한 비용 증가", "원문 수정 이후 기존 요약과의 불일치",
        "외부 AI API 사용에 따른 운영 비용", "브라우저에 종속된 사용자 식별",
        "초기 데이터 조회에 따른 대기 시간", "주변 소음에 따른 음성 인식 정확도 저하"
    ]);
    let list = null;
    let chapter;
    let content;
    let card;
    let chapterNumber = 0;
    let showingBenefits = false;
    function createChapter(label) {
        showingBenefits = label === "기대 효과";
        chapter = document.createElement("section");
        chapter.className = "welcome-chapter";
        const heading = document.createElement("h2");
        heading.id = "welcome-chapter-" + (++chapterNumber);
        heading.dataset.number = String(chapterNumber).padStart(2, "0");
        heading.textContent = label;
        chapter.setAttribute("aria-labelledby", heading.id);
        content = document.createElement("div");
        content.className = "welcome-chapter-content";
        chapter.append(heading, content);
        article.append(chapter);
        card = null;
    }
    // The welcome page is informational: always show the current frontend copy,
    // including for visitors whose saved welcome page contains an older version.
    const text = welcomePageState().segments.map(segment => segment.text).join("\n\n");
    for (const line of text.split(/\n+/).map(line => line.trim()).filter(Boolean)) {
        if (/^\d+\.\s/.test(line)) {
            if (!list) { list = document.createElement("ol"); content.append(list); }
            const item = document.createElement("li");
            item.textContent = line.replace(/^\d+\.\s*/, "");
            item.className = "welcome-step welcome-reveal";
            list.append(item);
            continue;
        }
        list = null;
        if (majorHeadings.has(line) || line === "아래 내용을 확인해주세요" || line === "사용 방법") {
            createChapter(line === "아래 내용을 확인해주세요" ? "사용 방법" : line);
            continue;
        }
        if (line === "갈피가 더 궁금하신 분들은 아래 내용을 읽어주세요") {
            const bridge = document.createElement("p");
            bridge.className = "welcome-more welcome-reveal";
            bridge.textContent = line;
            article.append(bridge);
            continue;
        }
        if (minorHeadings.has(line) || showingBenefits) {
            card = document.createElement("section");
            card.className = "welcome-card welcome-reveal";
            content.append(card);
        }
        const element = document.createElement(minorHeadings.has(line) ? "h3" : "p");
        element.textContent = line;
        (card || content || hero).append(element);
    }
    const progress = document.createElement("div");
    progress.className = "welcome-progress";
    progress.setAttribute("aria-hidden", "true");
    article.prepend(progress);
    disposeWelcomeMotion = animateWelcomePage(article);
}

function animateWelcomePage(article) {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = article.querySelectorAll(".welcome-reveal");
    const chapters = article.querySelectorAll(".welcome-chapter");
    let observer;
    let frame;
    function update() {
        frame = null;
        const rect = article.getBoundingClientRect();
        const height = window.innerHeight;
        const amount = Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height - height)));
        article.style.setProperty("--welcome-progress", amount);
        for (const chapter of chapters) {
            const bounds = chapter.getBoundingClientRect();
            chapter.classList.toggle("is-current", bounds.top < height * .6 && bounds.bottom > height * .35);
        }
    }
    function schedule() { if (frame == null) frame = requestAnimationFrame(update); }
    function configure() {
        observer?.disconnect();
        article.classList.remove("welcome-motion");
        if (!preference.matches && "IntersectionObserver" in window) {
            observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            }, { threshold: 0, rootMargin: "0px 0px -32px 0px" });
            article.classList.add("welcome-motion");
            for (const target of targets) observer.observe(target);
        }
        schedule();
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    preference.addEventListener("change", configure);
    configure();
    return () => {
        observer?.disconnect();
        if (frame != null) cancelAnimationFrame(frame);
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        preference.removeEventListener("change", configure);
    };
}

function welcomePageState() {
    const paragraphs = [
        "사용 방법",
        "1. 좌측 또는 상단 탭 메뉴의 새 페이지를 눌러 사용을 시작하세요",
        "2. 페이지의 제목을 입력하세요",
        "3. 설정 탭에서 입력 받을 언어와 사용자가 이해하기 편한 언어를 선택하세요",
        "4. 받아쓰기 시작 버튼을 눌러 받아쓰기와 선택한 언어로 번역되는 걸 확인하세요",
        "5. 확정이 완료된 원문을 클릭하여 원하는 내용으로 수정해 보세요",
        "6. 모르는 용어를 드래그하여 해당 용어의 설명을 확인해보세요",
        "7. 한 번 드래그한 용어는 표시가 남아요. 마우스를 표시 위에 올리거나 다시 드래그해보세요 ",
        "8. 요약 버튼을 눌러 긴 내용의 요약을 확인해보세요",
        "9. 요약 탭에서도 드래그 설명 기능은 동작합니다",
        "10. 자동 교정 기능이 불편하다면 설정 탭에서 끌 수 있어요",
        "갈피가 더 궁금하신 분들은 아래 내용을 읽어주세요",
        "개발 과정에서 겪은 문제 및 해결",
        "문맥에 맞지 않는 용어 설명을 제공하는 문제",
        "예를 들어 스레드는 컴퓨터에서는 프로세스의 실행 흐름을 의미하고 의류에서는 실을 의미합니다. 하지만 단어 하나만 가지곤 단어의 어떤 뜻을 의미하는지 파악하기 어렵습니다. 이런 문제를 해결하기 위해 단어 설명을 요청할 때 목표 단어와 앞뒤 각각 최대 120글자의 문맥을 함께 전달해 문맥에 맞는 설명을 제공합니다.",
        "로그인 없는 사용자 식별",
        "현재 갈피는 시연 단계이므로 접근성을 위해 아이디, 비밀번호 기반의 로그인을 사용하지 않습니다.",
        "대신 방문자가 처음 갈피에 방문하면 무작위 UUID를 발급해 서버의 서명이 포함된 JWT 토큰을 발급하고 사용자 브라우저의 HttpOnly 쿠키에 저장합니다. 이후 브라우저는 요청마다 요청 헤더에 JWT 토큰을 포함하고",
        "서버는 해당 토큰의 서명을 검증하고 토큰에 포함된 UUID를 통해 사용자를 식별합니다.",
        "반복적인 API 호출로 인한 비용 증가",
        "같은 내용에 대해 번역이나 용어 설명을 요청할 때마다 AI API를 호출하면 불필요한 비용과 응답 대기 시간이 발생합니다. 이런 문제를 해결하기 위해 서버에서 받은 결과를 브라우저 메모리에 캐싱하고, 동일한 요청에는 기존 결과를 재사용하도록 했습니다.",
        "번역과 용어 설명은 페이지 데이터와 함께 DB에도 저장합니다. 페이지를 다시 열면 저장된 결과를 불러와 브라우저 메모리 캐시로 복원하기 때문에, 이전에 확인한 내용을 다시 요청하는 일을 줄일 수 있습니다.",
        "요약은 서버에서도 DB에 저장된 결과를 재사용합니다. 현재 원문과 대상 언어가 기존 요약을 생성했을 때와 같다면 AI API를 다시 호출하지 않고 저장된 요약을 반환합니다.",
        "원문 수정 이후 기존 요약과의 불일치",
        "요약을 생성한 뒤 원문이 수정되면 기존 요약이 현재 내용을 제대로 반영하지 못할 수 있습니다. 이런 문제를 해결하기 위해 요약을 저장할 때 대상 언어와 원문 텍스트로 SHA-256 해시를 계산해 함께 저장합니다.",
        "이후 요약 요청이 들어오면 현재 원문과 대상 언어로 계산한 해시를 저장된 값과 비교합니다. 해시가 같으면 기존 요약을 재사용하고, 다르면 원문이나 대상 언어가 변경된 것으로 판단해 새로운 요약을 생성합니다.",
        "요약을 생성하는 도중 원문이 바뀌는 상황에도 대비했습니다. AI 응답을 받은 뒤 DB에 저장하기 직전에 현재 원문의 해시를 다시 계산하고, 생성 요청 당시의 해시와 비교합니다. 두 값이 다르면 변경 전 원문으로 생성한 결과이므로 저장하지 않고 409 Conflict 응답을 반환합니다. 이를 통해 이전 원문에 대한 요약이 최신 결과처럼 저장되는 것을 방지합니다.",
        "개선할 점",
        "외부 AI API 사용에 따른 운영 비용",
        "현재 갈피는 번역, 용어 설명, 문장 교정과 요약에 외부 AI API를 사용합니다. 캐시로 반복 호출을 줄이고 있지만, 새로운 요청이 늘어나면 운영 비용도 증가합니다.",
        "이를 개선하기 위해 기능별로 필요한 응답 품질과 비용을 비교하고, 경량 모델이나 자체 모델 도입을 검토할 계획입니다. 자체 모델도 서버 운영 비용이 발생하므로, 실제 사용량을 기준으로 적합한 방식을 선택하고자 합니다.",
        "브라우저에 종속된 사용자 식별",
        "현재는 브라우저의 쿠키에 저장된 JWT로 방문자를 식별합니다. 따라서 같은 사용자라도 다른 브라우저나 기기로 접속하거나 쿠키를 삭제하면 기존 기록에 접근하기 어렵습니다.",
        "이런 한계를 개선하기 위해 계정 기반 로그인을 도입하고, 기존 방문자의 기록을 계정에 연결하는 기능을 마련할 계획입니다. 이를 통해 여러 기기에서도 기록을 이어서 확인할 수 있도록 하고자 합니다.",
        "초기 데이터 조회에 따른 대기 시간",
        "접속 후 방문자를 식별하고 저장된 페이지를 불러오는 동안 대기 시간이 발생합니다. 페이지 수와 저장된 내용이 많아지면 조회와 데이터 전송에 드는 부담도 커질 수 있습니다.",
        "이를 개선하기 위해 서버 응답과 DB 조회 시간을 먼저 측정하고, 병목에 따라 사용자별 조회와 정렬을 위한 인덱스, 목록에 필요한 항목만 조회하는 방식, 페이지네이션 등을 검토할 계획입니다.",
        "주변 소음에 따른 음성 인식 정확도 저하",
        "주변 소음이 크거나 여러 사람이 동시에 말하는 환경에서는 음성이 잘못 인식될 수 있습니다. 현재는 브라우저의 음성 인식 API를 사용하므로 인식 과정을 직접 제어하는 데 한계가 있습니다.",
        "향후에는 별도 음성 수집과 소음 제거 등의 전처리, 녹음 기반 재인식 방식을 검토할 계획입니다. 녹음 기능을 도입할 경우에는 음성 데이터의 수집 안내와 보관·삭제 방식도 함께 설계하고자 합니다.",
        "기대 효과",
        "다문화 학생들이 언어의 장벽을 넘어 수업 내용을 이해하는 데 도움을 줄 수 있습니다",
        "외국인 근로자들이 전문 용어와 업무 지시를 이해하고 의사소통하는 데 도움을 줄 수 있습니다",
        "실시간 음성 기록으로 필기 부담을 줄여 강의나 발표에 집중할 수 있도록 돕습니다",
        "문맥 기반 용어 설명으로 낯선 표현과 전문 지식의 이해를 도울 수 있습니다",
        "요약과 기록 저장을 통해 핵심 내용을 빠르게 파악하고 복습하는 데 도움을 줄 수 있습니다"
    ];
    return {
        inputLanguage: "ko-KR",
        userLanguage: preferredUserLanguage || "ko-KR",
        translations: [],
        explanations: [],
        // Preserve the supplied blank lines, with single line breaks within the numbered list.
        segments: [{
            text: paragraphs.map((text, index) => {
                const continuesList = /^\d+\.\s/.test(text) && /^\d+\.\s/.test(paragraphs[index - 1] || "");
                return (index === 0 ? "" : continuesList ? "\n" : "\n\n") + text.trim();
            }).join(""),
            inputLanguage: "ko-KR",
            timestamp: null
        }]
    };
}
