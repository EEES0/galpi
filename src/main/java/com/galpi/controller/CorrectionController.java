package com.galpi.controller;

import com.galpi.dto.CorrectionRequest;
import com.galpi.dto.CorrectionResponse;
import com.galpi.service.CorrectionService;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/sentence/correct")
public class CorrectionController {
    private final CorrectionService corrections;
    public CorrectionController(CorrectionService corrections) { this.corrections = corrections; }

    @PostMapping
    public CorrectionResponse correct(@RequestBody CorrectionRequest request) {
        if (request.sentence() == null || request.sentence().isBlank()
                || request.sentence().length() > 4000
                || request.context() == null || request.context().length() > 12000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sentence or context");
        }
        return new CorrectionResponse(corrections.correct(request.sentence(), request.context()));
    }
}
