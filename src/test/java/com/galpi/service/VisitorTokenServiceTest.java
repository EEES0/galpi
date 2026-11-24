package com.galpi.service;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class VisitorTokenServiceTest {
    private static final String SECRET = "dGVzdC1vbmx5LXNlY3JldC1rZXktMzItYnl0ZXMtbG9uZyE=";
    private static final String USER = "6533d180-ce9c-45e8-afed-50fdc365328e";
    private static final Instant NOW = Instant.parse("2026-11-25T00:00:00Z");
    private final VisitorTokenService tokens = new VisitorTokenService(SECRET, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void issuedTokenWorksUntilExactExpiry() {
        var token = tokens.issue(USER);
        assertEquals(USER, tokens.verify(token.value()).orElseThrow().userId());
        assertTrue(new VisitorTokenService(SECRET, Clock.fixed(token.expiresAt().minusSeconds(1), ZoneOffset.UTC))
                .verify(token.value()).isPresent());
        assertTrue(new VisitorTokenService(SECRET, Clock.fixed(token.expiresAt(), ZoneOffset.UTC))
                .verify(token.value()).isEmpty());
        String otherKey = Base64.getEncoder().encodeToString(new byte[32]);
        assertTrue(new VisitorTokenService(otherKey, Clock.fixed(NOW, ZoneOffset.UTC)).verify(token.value()).isEmpty());
    }

    private String signed(JWSAlgorithm algorithm, String issuer, String audience, Date issued, Date expiry, String subject) throws Exception {
        var claims = new JWTClaimsSet.Builder().issuer(issuer).audience(audience).subject(subject)
                .issueTime(issued).expirationTime(expiry).build();
        var jwt = new SignedJWT(new JWSHeader.Builder(algorithm).type(JOSEObjectType.JWT).build(), claims);
        jwt.sign(new MACSigner(Base64.getDecoder().decode(SECRET)));
        return jwt.serialize();
    }

    @Test
    void rejectsInvalidClaimsEvenWithValidSignature() throws Exception {
        Date issued = Date.from(NOW);
        Date expiry = Date.from(NOW.plusSeconds(60));
        assertTrue(tokens.verify(signed(JWSAlgorithm.HS256, "other", "galpi-visitor", issued, expiry, USER)).isEmpty());
        assertTrue(tokens.verify(signed(JWSAlgorithm.HS256, "galpi", "other", issued, expiry, USER)).isEmpty());
        assertTrue(tokens.verify(signed(JWSAlgorithm.HS256, "galpi", "galpi-visitor", issued, null, USER)).isEmpty());
        assertTrue(tokens.verify(signed(JWSAlgorithm.HS256, "galpi", "galpi-visitor", null, expiry, USER)).isEmpty());
        assertTrue(tokens.verify(signed(JWSAlgorithm.HS256, "galpi", "galpi-visitor", Date.from(NOW.plusSeconds(1)), expiry, USER)).isEmpty());
        assertTrue(tokens.verify(signed(JWSAlgorithm.HS256, "galpi", "galpi-visitor", issued, expiry, "invalid")).isEmpty());
        assertTrue(tokens.verify(null).isEmpty());
        assertTrue(tokens.verify(USER).isEmpty());
        assertTrue(tokens.verify("a".repeat(4097)).isEmpty());
        // An unsigned JWT must never be treated as a visitor credential.
        assertTrue(tokens.verify(new com.nimbusds.jwt.PlainJWT(new JWTClaimsSet.Builder().subject(USER).build()).serialize()).isEmpty());
    }

    @Test
    void rejectsOtherHmacAlgorithms() throws Exception {
        byte[] longKey = new byte[64];
        Arrays.fill(longKey, (byte) 7);
        var verifier = new VisitorTokenService(Base64.getEncoder().encodeToString(longKey), Clock.fixed(NOW, ZoneOffset.UTC));
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS512).type(JOSEObjectType.JWT).build(),
                new JWTClaimsSet.Builder().issuer("galpi").audience("galpi-visitor").subject(USER)
                        .issueTime(Date.from(NOW)).expirationTime(Date.from(NOW.plusSeconds(60))).build());
        jwt.sign(new MACSigner(longKey));
        assertTrue(verifier.verify(jwt.serialize()).isEmpty());
    }

    @Test
    void refusesMissingOrWeakKeyConfiguration() {
        assertThrows(IllegalArgumentException.class, () -> new VisitorTokenService(""));
        assertThrows(IllegalArgumentException.class, () -> new VisitorTokenService("not base64!"));
        assertThrows(IllegalArgumentException.class, () -> new VisitorTokenService("c2hvcnQ="));
    }
}
