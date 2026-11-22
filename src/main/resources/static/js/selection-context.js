function termKey(term, context, segmentation,
    inputLanguage = segmentation.languages[0], userLanguage = userLanguageSelect.value) {
    return JSON.stringify([inputLanguage, userLanguage, term.trim(), context, segmentation]);
}

function selectableSegments(range) {
    const first = getSegment(range.startContainer);
    const last = getSegment(range.endContainer);
    if (!first || !last) return [];
    const root = selectionRoot(first);
    if (!root || root !== selectionRoot(last)) return [];
    if (root === summaryElement) return Array.from(root.querySelectorAll(".summary-segment"));
    const translated = first.classList.contains("segment-translation");
    if (translated !== last.classList.contains("segment-translation")) return [];
    return Array.from(finalElement.querySelectorAll(translated ? ".segment-translation" : ".segment"));
}

function selectionRoot(node) {
    if (finalElement.contains(node)) return finalElement;
    if (summaryElement.contains(node)) return summaryElement;
    return null;
}

function segmentationText(segmentation) {
    return segmentation.segments.map((text, index, segments) => text.slice(
        index === 0 ? segmentation.startOffset : 0,
        index === segments.length - 1 ? segmentation.endOffset : text.length
    )).join(" ").trim();
}

function getSegmentation(range) {
    const segments = selectableSegments(range);
    const first = segments.indexOf(getSegment(range.startContainer));
    const last = segments.indexOf(getSegment(range.endContainer));
    if (first < 0 || last < first) return null;
    return {
        segments: segments.slice(first, last + 1).map(node => node.textContent),
        languages: segments.slice(first, last + 1).map(node => node.dataset.inputLanguage || "ko-KR"),
        startOffset: getTextOffset(segments[first], range.startContainer, range.startOffset),
        endOffset: getTextOffset(segments[last], range.endContainer, range.endOffset),
        ...(segments[first].classList.contains("segment-translation") ? { translation: true } : {}),
        ...(selectionRoot(segments[first]) === summaryElement ? { summary: true } : {})
    };
}

function getSegment(node) {
    const element = node.nodeType === Node.TEXT_NODE
        ? node.parentElement
        : node;

    return element?.closest(".segment, .segment-translation, .summary-segment");
}

function getTextOffset(element, node, offset) {
    const range = document.createRange();

    range.selectNodeContents(element);
    range.setEnd(node, offset);

    return range.toString().length;
}

function findContext(range) {
    const segments = selectableSegments(range);

    const startSegment = getSegment(range.startContainer);
    const endSegment = getSegment(range.endContainer);

    if (!startSegment || !endSegment) return null;

    const startIndex = segments.indexOf(startSegment);
    const endIndex = segments.indexOf(endSegment);

    if (startIndex === -1 || endIndex === -1) {
        return null;
    }

    const texts = segments.map(s => s.textContent);
    const fullText = texts.join(" ");

    const offsets = [];
    let position = 0;

    texts.forEach((text, i) => {
        offsets.push(position);
        position += text.length;

        if (i < texts.length - 1) position++;
    });

    const start = offsets[startIndex] +
        getTextOffset(
            startSegment,
            range.startContainer,
            range.startOffset
        );

    const end = offsets[endIndex] +
        getTextOffset(
            endSegment,
            range.endContainer,
            range.endOffset
        );

    const WINDOW_SIZE = 120;

    let left = Math.max(0, start - WINDOW_SIZE);
    let right = Math.min(
        fullText.length,
        end + WINDOW_SIZE
    );

    if (left > 0) {
        const space = fullText.indexOf(" ", left);
        if (space !== -1 && space < start) {
            left = space + 1;
        }
    }

    if (right < fullText.length) {
        const space = fullText.lastIndexOf(" ", right);
        if (space > end) {
            right = space;
        }
    }

    return fullText.slice(left, right).trim();
}
