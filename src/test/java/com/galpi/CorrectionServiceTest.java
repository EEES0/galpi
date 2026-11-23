package com.galpi.service;

import com.galpi.service.CorrectionService;
import com.galpi.controller.CorrectionController;
import com.galpi.dto.CorrectionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class CorrectionServiceTest {
    @Test
    void sendsContextAndReturnsOnlyCorrectedSentence() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var mapper = JsonMapper.builder().build();
        var service = new CorrectionService(builder.baseUrl("https://api.openai.com/v1").build(), mapper, "test-model");
        server.expect(requestTo("https://api.openai.com/v1/responses"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("surrounding context")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("He go home.")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("We are talking about today.")))
                .andRespond(withSuccess("""
                        {"status":"completed","output":[{"type":"message","content":[
                        {"type":"output_text","text":"He goes home."}]}]}
                        """, MediaType.APPLICATION_JSON));
        assertEquals("He goes home.", service.correct("He go home.", "We are talking about today."));
        server.verify();
    }

    @Test
    void providerFailureReturnsBadGateway() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new CorrectionService(builder.baseUrl("https://api.openai.com/v1").build(), JsonMapper.builder().build(), "test-model");
        server.expect(requestTo("https://api.openai.com/v1/responses"))
                .andRespond(withServerError());
        var error = assertThrows(ResponseStatusException.class, () -> service.correct("Hello.", ""));
        assertEquals(HttpStatus.BAD_GATEWAY, error.getStatusCode());
        server.verify();
    }

    @Test
    void rejectsInvalidInputWithoutCallingProvider() {
        var service = mock(CorrectionService.class);
        var controller = new CorrectionController(service);
        for (var request : new CorrectionRequest[] {
                new CorrectionRequest(" ", ""), new CorrectionRequest(null, ""),
                new CorrectionRequest("x".repeat(4001), ""),
                new CorrectionRequest("Hello", "x".repeat(12001)), new CorrectionRequest("Hello", null) }) {
            assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                    () -> controller.correct(request)).getStatusCode());
        }
        verifyNoInteractions(service);
    }
}
