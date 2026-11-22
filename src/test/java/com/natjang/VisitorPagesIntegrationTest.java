package com.natjang;

import com.natjang.repository.UserRepository;
import com.natjang.entity.Page;
import jakarta.persistence.EntityManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import com.natjang.service.SummaryGenerator;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.anyString;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:visitor-pages;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop", "openai.api-key=test", "openai.model=test"
})
class VisitorPagesIntegrationTest {
    @Autowired Environment environment;
    @Autowired JsonMapper mapper;
    @Autowired UserRepository users;
    @Autowired EntityManager entityManager;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean SummaryGenerator summaryGenerator;
    private final HttpClient client = HttpClient.newHttpClient();

    private HttpResponse<String> request(String method, String path, String cookie, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:"
                + environment.getProperty("local.server.port") + "/api/pages" + path));
        if (cookie != null) request.header("Cookie", cookie);
        request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    private String cookie(HttpResponse<String> response) {
        String header = response.headers().firstValue("set-cookie").orElseThrow();
        assertTrue(header.contains("HttpOnly"));
        assertTrue(header.contains("SameSite=Lax"));
        return header.split(";", 2)[0];
    }

    @Test
    void visitorCanCreateSaveAndReloadOnlyTheirOwnPages() throws Exception {
        var first = request("GET", "", null, null);
        assertEquals(200, first.statusCode());
        String identity = cookie(first);
        String uuid = identity.substring(identity.indexOf('=') + 1);
        assertTrue(users.findById(uuid).isPresent());
        assertEquals(0, mapper.readTree(first.body()).size());

        var created = request("POST", "", identity, null);
        assertEquals(200, created.statusCode());
        JsonNode page = mapper.readTree(created.body());
        String path = "/" + page.path("id").asText();
        String state = "{\"inputLanguage\":\"en-US\",\"userLanguage\":\"ko-KR\","
                + "\"segments\":[{\"text\":\"Hello\",\"inputLanguage\":\"en-US\",\"timestamp\":\"2026-11-17T00:00:00Z\"}],"
                + "\"translations\":[[\"key\",\"translation\"]],\"explanations\":[[\"term\",{\"context\":\"Hello\"}]]}";
        String body = "{\"title\":\"Saved lesson\",\"state\":" + state + ",\"version\":" + page.path("version").asLong() + "}";
        var saved = request("PUT", path, identity, body);
        assertEquals(200, saved.statusCode(), saved.body());
        assertEquals(409, request("PUT", path, identity, body).statusCode());

        var reloaded = request("GET", path, identity, null);
        assertEquals(identity, cookie(reloaded));
        JsonNode restored = mapper.readTree(reloaded.body());
        assertEquals("Saved lesson", restored.path("title").asText());
        assertEquals(mapper.readTree(state), restored.path("state"));
        assertEquals(1, mapper.readTree(request("GET", "", identity, null).body()).size());

        String stranger = cookie(request("GET", "", null, null));
        assertNotEquals(identity, stranger);
        assertEquals(404, request("GET", path, stranger, null).statusCode());
        assertEquals(404, request("PUT", path, stranger, body).statusCode());
        assertNotEquals("natjang_visitor=bad", cookie(request("GET", "", "natjang_visitor=bad", null)));
        String unknown = "natjang_visitor=00000000-0000-0000-0000-000000000000";
        assertNotEquals(unknown, cookie(request("GET", "", unknown, null)));
        assertEquals(200, request("POST", "", identity, null).statusCode());
        assertEquals(2, mapper.readTree(request("GET", "", identity, null).body()).size());
        assertEquals(404, request("DELETE", path, stranger, null).statusCode());
        assertEquals(200, request("GET", path, identity, null).statusCode());

        assertEquals(204, request("DELETE", path, identity, null).statusCode());
        assertEquals(404, request("GET", path, identity, null).statusCode());
        assertEquals(404, request("DELETE", path, identity, null).statusCode());
        assertEquals(1, mapper.readTree(request("GET", "", identity, null).body()).size());
        assertTrue(users.findById(uuid).isPresent());
    }

    @Test
    void summaryChecksOwnershipCachesByTranscriptAndDoesNotConflictWithEditorSaves() throws Exception {
        String owner = cookie(request("GET", "", null, null));
        String stranger = cookie(request("GET", "", null, null));
        JsonNode page = mapper.readTree(request("POST", "", owner, null).body());
        String path = "/" + page.path("id").asString();
        String state = "{\"userLanguage\":\"ko-KR\",\"segments\":[{\"text\":\"Gravity attracts objects.\"}],"
                + "\"translations\":[],\"explanations\":[]}";
        String save = "{\"title\":\"Physics\",\"state\":" + state + ",\"version\":" + page.path("version").asLong() + "}";
        JsonNode saved = mapper.readTree(request("PUT", path, owner, save).body());
        long editorVersion = saved.path("version").asLong();

        assertEquals(404, request("GET", path + "/summary", stranger, null).statusCode());
        assertEquals(404, request("POST", path + "/summary", stranger, "{}").statusCode());
        assertEquals(404, request("GET", path + "/summary", owner, null).statusCode());
        verifyNoInteractions(summaryGenerator);

        when(summaryGenerator.generate("Gravity attracts objects.", "ko-KR")).thenReturn("Gravity summary");
        var generated = request("POST", path + "/summary", owner, "{}");
        assertEquals(200, generated.statusCode(), generated.body());
        assertFalse(mapper.readTree(generated.body()).path("cached").asBoolean());
        assertEquals("Gravity summary", mapper.readTree(generated.body()).path("summary").asString());
        assertEquals(editorVersion, mapper.readTree(request("GET", path, owner, null).body()).path("version").asLong());
        assertTrue(mapper.readTree(request("GET", path + "/summary", owner, null).body()).path("cached").asBoolean());
        assertTrue(mapper.readTree(request("POST", path + "/summary", owner, "{}").body()).path("cached").asBoolean());
        verify(summaryGenerator, times(1)).generate(anyString(), anyString());

        // A normal editor save must neither conflict with nor erase a concurrently-created summary.
        String resave = "{\"title\":\"Renamed\",\"state\":" + state + ",\"version\":" + editorVersion + "}";
        var renamed = request("PUT", path, owner, resave);
        assertEquals(200, renamed.statusCode(), renamed.body());
        assertEquals(200, request("GET", path + "/summary", owner, null).statusCode());
        long newVersion = mapper.readTree(renamed.body()).path("version").asLong();
        String changed = resave.replace("Gravity attracts objects.", "Energy is conserved.")
                .replace("\"version\":" + editorVersion, "\"version\":" + newVersion);
        assertEquals(200, request("PUT", path, owner, changed).statusCode());
        assertEquals(404, request("GET", path + "/summary", owner, null).statusCode());
        assertEquals(400, request("POST", path + "/summary", owner, "{\"targetLanguage\":\"bad language\"}").statusCode());
        verify(summaryGenerator, times(1)).generate(anyString(), anyString());
    }

    @Test
    void changedTranscriptDuringGenerationRejectsStaleSummary() throws Exception {
        String owner = cookie(request("GET", "", null, null));
        JsonNode page = mapper.readTree(request("POST", "", owner, null).body());
        String id = page.path("id").asString();
        String path = "/" + id;
        String body = "{\"title\":\"Lesson\",\"state\":{\"segments\":[{\"text\":\"Original\"}],"
                + "\"translations\":[],\"explanations\":[]},\"version\":" + page.path("version").asLong() + "}";
        assertEquals(200, request("PUT", path, owner, body).statusCode());
        when(summaryGenerator.generate(anyString(), anyString())).thenAnswer(invocation -> {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                Page editing = entityManager.find(Page.class, id);
                editing.saveContent(editing.getTitle(), editing.getContent().replace("Original", "Changed"));
            });
            return "Stale summary";
        });
        assertEquals(409, request("POST", path + "/summary", owner, "{}").statusCode());
        assertEquals(404, request("GET", path + "/summary", owner, null).statusCode());
    }
}
