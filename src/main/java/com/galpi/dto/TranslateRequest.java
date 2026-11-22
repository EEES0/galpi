package com.galpi.dto;

public record TranslateRequest(
        String text,
        String targetLanguage
) {
}
