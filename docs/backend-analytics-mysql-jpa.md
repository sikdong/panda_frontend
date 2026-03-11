# Backend Implementation (Spring Boot + JPA + MySQL)

프론트 `/admin/metrics/dau` 화면과 맞는 백엔드 구현 템플릿입니다.

## 1) 핵심 응답 DTO

```java
// package com.example.analytics.dto;

import java.util.List;

public record DailyMetricDto(
    String date,
    int dau,
    int visits
) {}

public record AdminDauResponseDto(
    List<DailyMetricDto> data
) {}
```

## 2) Service 반환 타입 (Map -> DTO)

```java
// package com.example.analytics.service;

import com.example.analytics.dto.DailyMetricDto;
import java.time.*;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AnalyticsService {
  private static final ZoneId KST = ZoneId.of("Asia/Seoul");
  private static final String ANON_ID = "anon_id";
  private final AnalyticsRepository analyticsRepository;

  @Transactional
  public void trackVisit(String actorKey, String path) {
    LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
    LocalDate eventDateKst = ZonedDateTime.now(KST).toLocalDate();
    try {
      analyticsRepository.insertDailyActorIgnore(eventDateKst, actorKey, nowUtc);
      analyticsRepository.insertVisit(eventDateKst, actorKey, path, nowUtc);
    } catch (Exception ignored) {
      // 집계 오류가 메인 API를 막지 않게 함
    }
  }

  public List<DailyMetricDto> getDailyMetrics(LocalDate startDate, LocalDate endDate) {
    return analyticsRepository.findDailyMetrics(startDate, endDate).stream()
        .map(r -> new DailyMetricDto(r.getDate(), r.getDau(), r.getVisits()))
        .toList();
  }
}
```

## 3) Controller 반환 타입 (Map -> DTO)

```java
// package com.example.analytics.controller;

import com.example.analytics.dto.AdminDauResponseDto;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/metrics")
public class AdminMetricsController {
  private final AnalyticsService analyticsService;

  @GetMapping("/dau")
  public AdminDauResponseDto getDau(
      @RequestParam LocalDate startDate,
      @RequestParam LocalDate endDate
  ) {
    return new AdminDauResponseDto(
        analyticsService.getDailyMetrics(startDate, endDate)
    );
  }
}
```

## 4) 응답 예시

```json
{
  "data": [
    { "date": "2026-03-01", "dau": 18, "visits": 41 },
    { "date": "2026-03-02", "dau": 24, "visits": 57 }
  ]
}
```

## 5) 참고

- `actor_key`는 쿠키 `anon_id`를 사용합니다.
- DAU dedupe는 `UNIQUE(event_date_kst, actor_key)`로 보장합니다.
- 방문수(visits)는 이벤트 테이블 `daily_visit_events`에서 일자별 `COUNT(*)`로 집계합니다.
