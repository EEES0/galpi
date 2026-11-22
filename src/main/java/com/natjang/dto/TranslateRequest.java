package com.natjang.dto;

public record TranslateRequest(
        String text,
        String targetLanguage
) {
}
