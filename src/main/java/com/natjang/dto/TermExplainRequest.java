package com.natjang.dto;

public record TermExplainRequest(
        String selectedTerm,
        String context,
        String inputLanguage,
        String userLanguage
) {
}