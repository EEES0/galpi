package com.natjang.controller;

import com.natjang.dto.SummaryRequest;
import com.natjang.dto.SummaryResponse;
import com.natjang.filter.VisitorFilter;
import com.natjang.service.SummaryService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/pages/{pageId}/summary")
public class SummaryController {
    private final SummaryService summaries;
    public SummaryController(SummaryService summaries) { this.summaries = summaries; }

    @GetMapping
    public SummaryResponse load(@RequestAttribute(VisitorFilter.USER_ID) String userId,
                                @PathVariable String pageId, @RequestParam(required = false) String targetLanguage) {
        return summaries.load(userId, pageId, targetLanguage);
    }

    @PostMapping
    public SummaryResponse summarize(@RequestAttribute(VisitorFilter.USER_ID) String userId,
                                     @PathVariable String pageId, @RequestBody(required = false) SummaryRequest request) {
        return summaries.summarize(userId, pageId, request);
    }
}
