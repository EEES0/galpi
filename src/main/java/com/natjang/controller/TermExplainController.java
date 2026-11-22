package com.natjang.controller;

import com.natjang.dto.TermExplainRequest;
import com.natjang.dto.TermExplainResponse;
import com.natjang.service.TermExplainService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/term/explain")
public class TermExplainController {
    private final TermExplainService termExplainService;
    public TermExplainController(TermExplainService termExplainService) {
        this.termExplainService = termExplainService;
    }
    @PostMapping("")
    public TermExplainResponse termExplain(
            @RequestBody TermExplainRequest request
            ) {
        if (request.selectedTerm() == null ||
                request.selectedTerm().isBlank() ||
                request.context() == null ||
                request.context().isBlank() ||
                request.selectedTerm().length() > 100 ||
                request.context().length() > 2000) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "유효하지 않은 요청입니다."
            );
        }
        return termExplainService.explain(request);
    }
}
