package com.galpi.filter;
import com.galpi.service.VisitorService;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.time.Duration;

@Component
public class VisitorFilter extends OncePerRequestFilter {
    public static final String USER_ID = "visitorUserId";
    public static final String COOKIE_NAME = "natjang_visitor";
    private final VisitorService visitors;
    public VisitorFilter(VisitorService visitors) { this.visitors = visitors; }
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(request.getContextPath() + "/api/");
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
        String userId = visitors.identify(cookie);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE_NAME, userId)
                .httpOnly(true).secure(request.isSecure()).sameSite("Lax").path("/")
                .maxAge(Duration.ofDays(365)).build().toString());
        request.setAttribute(USER_ID, userId);
        chain.doFilter(request, response);
    }
}
