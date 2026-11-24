package com.galpi.service;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

@Service
public class VisitorTokenService {
    private static final String ISSUER = "galpi";
    private static final String AUDIENCE = "galpi-visitor";
    private static final Duration LIFETIME = Duration.ofDays(365);
    private final byte[] key;
    private final Clock clock;

    public record Token(String value, String userId, Instant expiresAt) {}

    @Autowired
    public VisitorTokenService(@Value("${galpi.visitor.jwt-secret}") String secret) {
        this(secret, Clock.systemUTC());
    }

    VisitorTokenService(String secret, Clock clock) {
        try {
            key = Base64.getDecoder().decode(secret);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("VISITOR_JWT_SECRET must be a Base64-encoded random key", exception);
        }
        if (key.length < 32) {
            throw new IllegalArgumentException("VISITOR_JWT_SECRET must decode to at least 32 random bytes");
        }
        this.clock = clock;
    }

    public Token issue(String userId) {
        Instant now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        Instant expiresAt = now.plus(LIFETIME);
        var claims = new JWTClaimsSet.Builder().issuer(ISSUER).audience(AUDIENCE)
                .subject(userId).issueTime(Date.from(now)).expirationTime(Date.from(expiresAt)).build();
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(), claims);
        try {
            jwt.sign(new MACSigner(key));
            return new Token(jwt.serialize(), userId, expiresAt);
        } catch (JOSEException exception) {
            throw new IllegalStateException("Could not sign visitor token", exception);
        }
    }

    public Optional<Token> verify(String value) {
        if (value == null || value.length() > 4096) return Optional.empty();
        try {
            var jwt = SignedJWT.parse(value);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm())
                    || !JOSEObjectType.JWT.equals(jwt.getHeader().getType())
                    || jwt.getHeader().getCriticalParams() != null
                    || !jwt.verify(new MACVerifier(key))) return Optional.empty();
            var claims = jwt.getJWTClaimsSet();
            Instant now = clock.instant();
            if (!ISSUER.equals(claims.getIssuer()) || !claims.getAudience().equals(java.util.List.of(AUDIENCE))
                    || claims.getExpirationTime() == null || claims.getIssueTime() == null
                    || !claims.getExpirationTime().toInstant().isAfter(now)
                    || claims.getIssueTime().toInstant().isAfter(now)
                    || !claims.getExpirationTime().after(claims.getIssueTime())
                    || claims.getSubject() == null
                    || !UUID.fromString(claims.getSubject()).toString().equals(claims.getSubject())) {
                return Optional.empty();
            }
            return Optional.of(new Token(value, claims.getSubject(), claims.getExpirationTime().toInstant()));
        } catch (ParseException | JOSEException | IllegalArgumentException exception) {
            return Optional.empty();
        }
    }
}
