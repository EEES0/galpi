package com.natjang.service;
import com.natjang.entity.User;
import com.natjang.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
public class VisitorService {
    private final UserRepository users;
    public VisitorService(UserRepository users) { this.users = users; }
    @Transactional
    public String identify(String cookie) {
        if (cookie != null) {
            try {
                String id = UUID.fromString(cookie).toString();
                if (id.equals(cookie)) {
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
