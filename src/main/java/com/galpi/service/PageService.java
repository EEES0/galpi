package com.galpi.service;
import com.galpi.entity.Page;
import com.galpi.repository.PageRepository;
import com.galpi.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class PageService {
    public record Summary(String id, String title, LocalDateTime updatedAt) {}
    public record Detail(String id, String title, JsonNode state, long version) {}
    public record Save(String title, JsonNode state, Long version) {}
    private final PageRepository pages;
    private final UserRepository users;
    private final JsonMapper mapper;
    public PageService(PageRepository pages, UserRepository users, JsonMapper mapper) {
        this.pages = pages; this.users = users; this.mapper = mapper;
    }
    @Transactional(readOnly = true)
    public List<Summary> list(String userId) {
        return pages.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(p -> new Summary(p.getId(), p.getTitle(), p.getUpdatedAt())).toList();
    }
    @Transactional
    public Detail create(String userId) {
        var user = users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Page page = pages.saveAndFlush(new Page(user, "새 페이지"));
        return detail(page);
    }
    @Transactional(readOnly = true)
    public Detail load(String userId, String id) { return detail(owned(userId, id)); }
    @Transactional
    public void delete(String userId, String id) {
        Page page = owned(userId, id);
        pages.delete(page);
        pages.flush();
    }
    @Transactional
    public Detail save(String userId, String id, Save request) {
        Page page = owned(userId, id);
        if (request == null || request.title() == null || request.title().length() > 200
                || request.state() == null || !request.state().isObject() || request.version() == null
                || !request.state().path("segments").isArray()
                || !request.state().path("translations").isArray()
                || !request.state().path("explanations").isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid page state");
        }
        if (request.version() != page.getVersion()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Page was modified in another tab");
        }
        String content = mapper.writeValueAsString(request.state());
        if (content.length() > 2_000_000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        page.saveContent(request.title(), content);
        pages.flush();
        return detail(page);
    }
    private Page owned(String userId, String id) {
        return pages.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
    private Detail detail(Page page) {
        return new Detail(page.getId(), page.getTitle(),
                page.getContent() == null ? null : mapper.readTree(page.getContent()), page.getVersion());
    }
}
