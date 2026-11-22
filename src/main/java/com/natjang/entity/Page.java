
package com.natjang.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "pages")
@org.hibernate.annotations.DynamicUpdate
public class Page {

    @Id
    @Column(columnDefinition = "CHAR(36)")
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Editor snapshot includes paragraph timestamps, language settings, translations and selection marks.
    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(columnDefinition = "TEXT")
    @org.hibernate.annotations.OptimisticLock(excluded = true)
    private String summary;

    @Column
    @org.hibernate.annotations.OptimisticLock(excluded = true)
    private LocalDateTime summaryUpdatedAt;

    @Column(length = 20)
    @org.hibernate.annotations.OptimisticLock(excluded = true)
    private String summaryLanguage;

    @Column(length = 64)
    @org.hibernate.annotations.OptimisticLock(excluded = true)
    private String summarySourceHash;

    public String getSummary() { return summary; }
    public LocalDateTime getSummaryUpdatedAt() { return summaryUpdatedAt; }
    public String getSummaryLanguage() { return summaryLanguage; }
    public String getSummarySourceHash() { return summarySourceHash; }
    public void updateSummary(String summary) {
        updateSummary(summary, null, null);
    }
    public void updateSummary(String summary, String language, String sourceHash) {
        this.summary = summary;
        this.summaryUpdatedAt = summary == null ? null : LocalDateTime.now();
        this.summaryLanguage = language;
        this.summarySourceHash = sourceHash;
    }

    public String getContent() { return content; }
    public long getVersion() { return version; }
    public void saveContent(String title, String content) {
        if (title == null || title.length() > 200) throw new IllegalArgumentException("invalid title");
        this.title = title;
        this.content = java.util.Objects.requireNonNull(content, "content");
        touch();
    }

    @Version
    @org.hibernate.annotations.ColumnDefault("0")
    private long version;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected Page() {
    }

    public Page(User user, String title) {
        java.util.Objects.requireNonNull(user, "user");
        if (title == null || title.length() > 200) throw new IllegalArgumentException("invalid title");
        this.id = UUID.randomUUID().toString();
        this.user = user;
        this.title = title;
    }

    public String getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public String getTitle() {
        return title;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void updateTitle(String title) {
        if (title == null || title.length() > 200) throw new IllegalArgumentException("invalid title");
        this.title = title;
        touch();
    }

    public void touch() {
        this.updatedAt = LocalDateTime.now();
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

}
