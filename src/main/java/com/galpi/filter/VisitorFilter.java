package com.galpi.filter;
import com.galpi.service.VisitorService;
import com.galpi.service.VisitorTokenService;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;

@Component
public class VisitorFilter extends OncePerRequestFilter {
    public static final String USER_ID = "visitorUserId";
    public static final String COOKIE_NAME = "galpi_visitor";
    private final VisitorService visitors;
    private final VisitorTokenService tokens;
    public VisitorFilter(VisitorService visitors, VisitorTokenService tokens) {
        this.visitors = visitors;
        this.tokens = tokens;
    }
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return "/api/ping".equals(path) || !path.startsWith("/api/");
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if ("cross-site".equals(request.getHeader("Sec-Fetch-Site"))) {
            response.sendError(403); return;
        }
        String cookie = null;
        if (request.getCookies() != null) {
            for (Cookie entry : request.getCookies()) {
                if (COOKIE_NAME.equals(entry.getName())) { cookie = entry.getValue(); break; }
            }
        }
        var verified = tokens.verify(cookie);
        String userId = visitors.identify(verified.map(VisitorTokenService.Token::userId).orElse(null));
        var token = verified.filter(value -> value.userId().equals(userId)).orElseGet(() -> tokens.issue(userId));
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE_NAME, token.value())
                .httpOnly(true).secure(request.isSecure()).sameSite("Lax").path("/")
                .maxAge(Duration.between(Instant.now(), token.expiresAt())).build().toString());
        request.setAttribute(USER_ID, userId);
        chain.doFilter(request, response);
    }
}
