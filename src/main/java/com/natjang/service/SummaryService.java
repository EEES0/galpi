package com.natjang.service;

import com.natjang.dto.SummaryRequest;
import com.natjang.dto.SummaryResponse;
import com.natjang.entity.Page;
import com.natjang.repository.PageRepository;
import com.natjang.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class SummaryService {
    private record Source(String transcript, String language, String hash) {}
    private record Snapshot(Source source, SummaryResponse cached) {}
    private final PageRepository pages;
    private final UserRepository users;
    private final SummaryGenerator generator;
    private final JsonMapper mapper;
    private final EntityManager entityManager;
    private final TransactionTemplate transactions;

    public SummaryService(PageRepository pages, UserRepository users, SummaryGenerator generator,
                          JsonMapper mapper, EntityManager entityManager, PlatformTransactionManager manager) {
        this.pages = pages;
        this.users = users;
        this.generator = generator;
        this.mapper = mapper;
        this.entityManager = entityManager;
        this.transactions = new TransactionTemplate(manager);
    }

    public SummaryResponse load(String userId, String pageId, String language) {
        return transactions.execute(status -> {
            Page page = owned(userId, pageId);
            SummaryResponse cached = cached(page, source(page, language));
            if (cached == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No current summary");
            return cached;
        });
    }

    public SummaryResponse summarize(String userId, String pageId, SummaryRequest request) {
        String language = request == null ? null : request.targetLanguage();
        Snapshot snapshot = transactions.execute(status -> {
            Page page = owned(userId, pageId);
            Source source = source(page, language);
            return new Snapshot(source, cached(page, source));
        });
        if (snapshot.cached() != null && (request == null || !Boolean.TRUE.equals(request.regenerate()))) return snapshot.cached();

        // The remote request runs outside a database transaction and holds no row locks.
        String summary = generator.generate(snapshot.source().transcript(), snapshot.source().language());
        if (summary == null || summary.isBlank() || summary.length() > 100_000) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Invalid summary result");
        }
        return transactions.execute(status -> {
            Page page = owned(userId, pageId);
            entityManager.refresh(page, LockModeType.PESSIMISTIC_WRITE);
            if (!page.getUser().getId().equals(userId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            // Include the default language again, in case the user changed it during generation.
            Source current = source(page, language);
            if (!current.hash().equals(snapshot.source().hash())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Transcript changed during summarization");
            }
            page.updateSummary(summary.trim(), current.language(), current.hash());
            pages.flush();
            return new SummaryResponse(pageId, page.getSummary(), current.language(), page.getSummaryUpdatedAt(), false);
        });
    }

    private Page owned(String userId, String pageId) {
        try {
            if (userId == null || !UUID.fromString(userId).toString().equals(userId) || !users.existsById(userId)) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
            }
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return pages.findByIdAndUserId(pageId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private Source source(Page page, String requestedLanguage) {
        var state = page.getContent() == null ? mapper.createObjectNode() : mapper.readTree(page.getContent());
        String language = requestedLanguage == null ? state.path("userLanguage").asString("ko-KR") : requestedLanguage;
        if (language == null || language.length() > 20 || !language.matches("[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid target language");
        }
        StringBuilder text = new StringBuilder();
        for (var segment : state.path("segments")) {
            var value = segment.isString() ? segment : segment.path("text");
            if (value.isString() && !value.asString().isBlank()) {
                if (!text.isEmpty()) text.append('\n');
                text.append(value.asString().trim());
            }
        }
        if (text.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No saved transcript to summarize");
        if (text.length() > 100_000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Transcript is too long");
        try {
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest((language + "\n" + text).getBytes(StandardCharsets.UTF_8)));
            return new Source(text.toString(), language, hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private SummaryResponse cached(Page page, Source source) {
        if (page.getSummary() == null || page.getSummary().isBlank()
                || !source.hash().equals(page.getSummarySourceHash())
                || !source.language().equals(page.getSummaryLanguage())) return null;
        return new SummaryResponse(page.getId(), page.getSummary(), page.getSummaryLanguage(), page.getSummaryUpdatedAt(), true);
    }
}
