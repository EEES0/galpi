package com.galpi.repository;
import com.galpi.entity.Page;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface PageRepository extends JpaRepository<Page, String> {
    List<Page> findByUserIdOrderByUpdatedAtDesc(String userId);
    Optional<Page> findByIdAndUserId(String id, String userId);
}
