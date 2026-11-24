package com.galpi.service;
import com.galpi.entity.User;
import com.galpi.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
public class VisitorService {
    private final UserRepository users;
    public VisitorService(UserRepository users) { this.users = users; }
    @Transactional
    public String identify(String verifiedUserId) {
        // Only a subject from a verified JWT may be supplied here, never a raw cookie.
        if (verifiedUserId != null) {
            try {
                String id = UUID.fromString(verifiedUserId).toString();
                if (id.equals(verifiedUserId)) {
                    var existing = users.findById(id);
                    if (existing.isPresent()) {
                        existing.get().updateLastSeenAt();
                        return id;
                    }
                }
            } catch (IllegalArgumentException ignored) {}
        }
        // Never accept an unknown client-supplied ID as a new identity.
        return users.saveAndFlush(User.create()).getId();
    }
}
