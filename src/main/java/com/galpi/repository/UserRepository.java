package com.galpi.repository;
import com.galpi.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
public interface UserRepository extends JpaRepository<User, String> {}
