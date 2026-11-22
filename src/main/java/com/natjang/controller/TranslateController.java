package com.natjang.controller;

import com.natjang.dto.TranslateRequest;
import com.natjang.dto.TranslateResponse;
import com.natjang.service.TranslateService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/translate")
public class TranslateController {
    private final TranslateService translateService;
    public TranslateController(TranslateService translateService) {
        this.translateService = translateService;
    }

    @PostMapping("")
    public TranslateResponse translate(@RequestBody TranslateRequest request) {
        return translateService.translate(request);
    }
}
