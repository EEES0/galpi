
package com.galpi.dto;

public record TermExplainResponse(
        String term,
        String translation,
        String description,
        String example
) {
}