package com.natjang.dto;

import java.time.LocalDateTime;

public record SummaryResponse(String pageId, String summary, String targetLanguage,
                              LocalDateTime updatedAt, boolean cached) {}
