package com.galpi.controller;
import com.galpi.filter.VisitorFilter;
import com.galpi.service.PageService;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/pages")
public class PageController {
    private final PageService pages;
    public PageController(PageService pages) { this.pages = pages; }
    @GetMapping
    public List<PageService.Summary> list(@RequestAttribute(VisitorFilter.USER_ID) String userId) {
        return pages.list(userId);
    }
    @PostMapping
    public PageService.Detail create(@RequestAttribute(VisitorFilter.USER_ID) String userId) {
        return pages.create(userId);
    }
    @GetMapping("/{id}")
    public PageService.Detail load(@RequestAttribute(VisitorFilter.USER_ID) String userId, @PathVariable String id) {
        return pages.load(userId, id);
    }
    @PutMapping("/{id}")
    public PageService.Detail save(@RequestAttribute(VisitorFilter.USER_ID) String userId,
                                  @PathVariable String id, @RequestBody PageService.Save request) {
        return pages.save(userId, id, request);
    }
    @DeleteMapping("/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void delete(@RequestAttribute(VisitorFilter.USER_ID) String userId, @PathVariable String id) {
        pages.delete(userId, id);
    }
}
