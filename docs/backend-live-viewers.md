# 상세보기 기준 실시간 조회자 수 기능 구현 가이드 (Backend)

## 목표
- 한 매물의 상세보기를 "지금 보고 있는 인원 수"를 실시간으로 계산한다.
- 기준은 페이지 진입 수가 아니라 "현재 연결이 살아 있는 세션 수"다.
- 같은 세션이 중복 집계되지 않아야 한다.

## 핵심 설계 원칙
- 누적 조회수(`viewCount`)와 실시간 조회자 수는 다른 데이터다.
- `viewCount`는 영구 저장 대상이다.
- 실시간 조회자 수는 휘발성 상태다.
- 따라서 실시간 조회자 수는 RDB 테이블보다는 Redis 같은 메모리 저장소가 적합하다.

## 권장 아키텍처

### 저장소
- Redis 사용 권장

### 통신
- 클라이언트 -> 서버:
  - 입장 이벤트
  - 이탈 이벤트
  - heartbeat 또는 연결 유지
- 서버 -> 클라이언트:
  - 특정 매물의 현재 조회자 수 broadcast

### 서버 구성
- API 서버
- WebSocket 또는 SSE 서버
- Redis

## 데이터 모델 권장안

### Redis Key 예시
- 매물별 활성 세션 집합
  - `listing:viewers:{listingId}`
- 세션별 현재 보고 있는 매물
  - `viewer:session:{viewerSessionId}`

### 저장 값 예시

#### Set
- key: `listing:viewers:123`
- members:
  - `session-a`
  - `session-b`

#### String or Hash
- key: `viewer:session:session-a`
- value:
  - 현재 보고 있는 `listingId`
  - 마지막 heartbeat 시간

## 권장 처리 방식

### 1. 입장 처리
입장 이벤트를 받으면:
1. 해당 세션이 이전에 보고 있던 매물이 있으면 그 매물에서 제거
2. 현재 매물 Set에 세션 추가
3. 세션 -> 현재 매물 매핑 갱신
4. TTL 갱신
5. 현재 count broadcast

이렇게 해야 매물 전환 시 중복 카운트가 생기지 않는다.

### 2. 이탈 처리
이탈 이벤트를 받으면:
1. 해당 매물 Set에서 세션 제거
2. 세션 매핑 삭제 또는 null 처리
3. 현재 count broadcast

### 3. 연결 끊김 처리
- WebSocket disconnect hook에서 세션 제거
- 예기치 않은 종료를 대비해 TTL 기반 정리도 추가

### 4. heartbeat 처리
- 마지막 heartbeat 시간을 갱신
- heartbeat가 일정 시간 이상 끊기면 만료 세션으로 간주

## TTL 정책 권장안
- heartbeat 주기: 20초 ~ 30초
- 만료 기준: 60초 ~ 90초

예시:
- 클라이언트 heartbeat 25초
- Redis TTL 75초

## API/이벤트 계약 예시

### WebSocket 이벤트

#### 입장
```json
{
  "type": "listing_view_enter",
  "listingId": 123,
  "viewerSessionId": "uuid",
  "userId": 456
}
```

#### 이탈
```json
{
  "type": "listing_view_leave",
  "listingId": 123,
  "viewerSessionId": "uuid"
}
```

#### heartbeat
```json
{
  "type": "listing_view_heartbeat",
  "listingId": 123,
  "viewerSessionId": "uuid"
}
```

#### 서버 broadcast
```json
{
  "type": "listing_viewer_count",
  "listingId": 123,
  "viewerCount": 4,
  "updatedAt": "2026-03-12T12:00:00Z"
}
```

## 멱등성 처리
- 같은 `listingId`, 같은 `viewerSessionId`로 입장 이벤트가 여러 번 와도 count가 증가하면 안 된다.
- Redis Set을 사용하면 중복 추가가 자동으로 막힌다.

## 동시성 처리
- Set 기반 연산을 사용하면 count 정합성이 좋아진다.
- 가능하면 아래 연산을 하나의 서비스 메서드 또는 Lua script 수준에서 묶는다.
  - 이전 매물 제거
  - 새 매물 추가
  - TTL 갱신
  - count 계산

## 추천 Redis 연산 예시

### 입장
1. `GET viewer:session:{sessionId}`
2. 이전 매물이 있으면 `SREM listing:viewers:{oldListingId} {sessionId}`
3. `SADD listing:viewers:{listingId} {sessionId}`
4. `SETEX viewer:session:{sessionId} 75 {listingId}`
5. `SCARD listing:viewers:{listingId}`

### 이탈
1. `SREM listing:viewers:{listingId} {sessionId}`
2. `DEL viewer:session:{sessionId}`
3. `SCARD listing:viewers:{listingId}`

## SSE로 구현하는 경우
- 입장:
  - `POST /listings/{listingId}/viewer-presence`
- 이탈:
  - `DELETE /listings/{listingId}/viewer-presence?viewerSessionId=uuid`
- 수신:
  - `GET /listings/{listingId}/viewer-stream`

SSE는 구현이 단순하지만, 양방향 제어가 필요한 경우 WebSocket이 더 자연스럽다.

## DB 저장 여부
- 실시간 조회자 수 자체는 DB 영구 저장 비권장
- 다만 분석용 스냅샷은 별도 저장 가능

저장해볼 수 있는 예:
- 매물별 최대 동시 조회자 수
- 시간대별 평균 동시 조회자 수
- 상세보기 체류 시간

이 데이터는 별도 analytics pipeline으로 분리하는 편이 낫다.

## 보안/남용 방지

### 1. 세션 위조
- 가능하면 서버가 접속 시 `viewerSessionId`를 검증하거나 재발급
- 로그인 사용자는 `userId`와 함께 검증

### 2. 과도한 연결
- 한 IP 또는 한 계정의 과도한 세션 생성 제한
- rate limit 적용

### 3. 비정상 종료
- disconnect hook + TTL cleanup 이중 안전장치 필요

## 백엔드 구현 순서

### 1. Redis 도입
- 실시간 viewer presence 저장소 준비

### 2. Presence 서비스 구현
- `enter(listingId, viewerSessionId)`
- `leave(listingId, viewerSessionId)`
- `heartbeat(listingId, viewerSessionId)`
- `getViewerCount(listingId)`

### 3. WebSocket/SSE 엔드포인트 구현
- 매물별 구독 채널 준비
- count 변경 시 해당 채널 broadcast

### 4. disconnect 정리 구현
- 연결 종료 시 자동 제거

### 5. TTL cleanup 검증
- 예기치 않은 종료 후 자동 감소하는지 확인

## 테스트 시나리오
- 같은 탭에서 상세보기 재진입해도 count 중복 증가 없음
- 같은 사용자가 다른 탭 2개면 2명으로 볼지 정책 확인
- A 매물에서 B 매물로 이동 시 A는 감소, B는 증가
- 브라우저 강제 종료 후 TTL 지나면 자동 감소
- 네트워크 끊김 후 재연결 시 count 복구
- 서버 재시작 후 presence 초기화 정책 확인

## 정책 결정이 필요한 항목
- 같은 계정의 멀티탭을 1명으로 볼지, 탭 수대로 볼지
- 로그인 사용자와 비로그인 사용자를 동일 정책으로 볼지
- 앱 백그라운드 상태를 접속 중으로 볼지
- 0명일 때 UI를 숨길지 표시할지

## 추천 결론
- 이 기능은 RDB보다 Redis presence 모델이 맞다.
- 현재 요구사항에서는 "상세보기 입장/이탈 + WebSocket broadcast + TTL cleanup"이 가장 현실적이다.
- 핵심은 정확한 카운트보다 "중복 없이 빠르게 수렴하는 현재 인원 수"를 만드는 것이다.
