# 상세보기 기준 실시간 조회자 수 기능 구현 가이드 (Frontend)

## 목표
- 기준 이벤트는 "상세보기 클릭 후 상세 패널/바텀시트가 열린 상태"다.
- 각 매물별로 "지금 이 순간 상세보기를 보고 있는 사용자 수"를 표시한다.
- 사용자가 상세보기를 닫거나 페이지를 이탈하면 즉시 카운트에서 빠져야 한다.

## 권장 방식
- 프론트는 REST로 상세 데이터를 가져오고, 실시간 조회자 수는 WebSocket 또는 SSE로 받는다.
- 이 기능은 단순 조회수 누적이 아니라 "현재 접속 중인 세션 수"이므로 폴링보다 실시간 연결이 적합하다.
- 우선순위:
  1. WebSocket
  2. SSE
  3. 임시 대안으로 짧은 주기 폴링

## 현재 프론트 기준 연결 지점
- 상세보기 진입 트리거: `src/pages/MapListingPage.jsx`
- 상세 데이터 렌더링: `src/components/Map/ListingDetailContent.jsx`
- API 래퍼 위치: `src/api/listingApi.js`

현재 흐름은 아래와 같다.
1. 사용자가 요약 보기에서 매물을 클릭한다.
2. `fetchListingDetail(listingId)`를 호출한다.
3. `selectedListingId`, `selectedListingDetail`이 세팅된다.
4. 상세 패널 또는 모바일 바텀시트가 열린다.

실시간 조회자 수 기능은 이 흐름에 "입장", "유지", "이탈" 처리를 붙이면 된다.

## 프론트에서 관리해야 할 상태
- `selectedListingId`: 현재 보고 있는 매물 ID
- `currentViewerCount`: 현재 매물의 실시간 조회자 수
- `viewerSessionId`: 브라우저 탭 단위 세션 ID
- `viewerConnectionState`: `idle | connecting | connected | disconnected`

## 세션 ID 전략
- 로그인 여부와 별개로 브라우저 탭 단위 식별자가 필요하다.
- 권장:
  - 탭 최초 진입 시 UUID 생성
  - `sessionStorage`에 저장
  - 새 탭은 다른 ID 사용

예시 키:
- `listingViewerSessionId`

## 권장 이벤트 흐름

### 1. 상세보기 진입
- `selectedListingId`가 설정되면 서버에 "입장" 이벤트를 보낸다.
- 이때 필요한 값:
  - `listingId`
  - `viewerSessionId`
  - 선택적으로 `userId`
  - 선택적으로 `deviceId`

### 2. 실시간 수신 시작
- 해당 매물 채널을 구독한다.
- 서버가 현재 인원 수를 push 하면 프론트는 `currentViewerCount`를 갱신한다.

### 3. 연결 유지
- WebSocket이면 heartbeat 또는 ping/pong
- SSE면 서버가 주기적으로 keep-alive 전송
- 프론트는 별도 heartbeat API를 만들지 말고 가능하면 실시간 연결 프로토콜에 포함시킨다.

### 4. 상세보기 종료
- 아래 상황에서 "이탈" 처리를 해야 한다.
  - 닫기 버튼 클릭
  - 다른 매물 상세보기로 전환
  - 라우트 이탈
  - 브라우저 탭 종료 또는 새로고침

### 5. 예외 종료 대비
- `beforeunload`, `pagehide`, `visibilitychange`로 보조 처리
- 탭 강제 종료는 100% 보장되지 않으므로 서버 TTL 정리가 반드시 있어야 한다.

## 권장 API/실시간 인터페이스 예시

### REST + WebSocket 조합

#### REST
- `GET /listings/{listingId}`: 상세 데이터 조회

#### WebSocket 메시지
- 입장
```json
{
  "type": "listing_view_enter",
  "listingId": 123,
  "viewerSessionId": "uuid"
}
```

- 이탈
```json
{
  "type": "listing_view_leave",
  "listingId": 123,
  "viewerSessionId": "uuid"
}
```

- 서버 푸시
```json
{
  "type": "listing_viewer_count",
  "listingId": 123,
  "viewerCount": 4
}
```

### SSE 대안
- 구독 시작:
  - `GET /listings/{listingId}/viewer-stream?viewerSessionId=uuid`
- 이탈:
  - `DELETE /listings/{listingId}/viewer-presence?viewerSessionId=uuid`

SSE는 수신 전용이라 구현은 단순하지만, 입장/이탈을 REST로 따로 처리해야 한다.

## 프론트 구현 순서

### 1. API 모듈 추가
- `src/api/listingApi.js`에 아래 성격의 함수 추가
  - `enterListingViewerPresence(listingId, viewerSessionId)`
  - `leaveListingViewerPresence(listingId, viewerSessionId)`
  - `createListingViewerStream(listingId, viewerSessionId)` 또는 WebSocket helper

### 2. 세션 ID 유틸 추가
- `src/utils`에 탭 단위 session id 유틸 추가
- 없다면 생성하고 `sessionStorage`에 저장

### 3. `MapListingPage.jsx`에 상태 추가
- `currentViewerCount`
- `viewerConnectionState`
- 연결 객체를 담을 `useRef`

### 4. 상세보기 진입 effect 추가
- `selectedListingId`가 바뀌면:
  - 이전 구독 정리
  - 새 매물 입장 처리
  - 새 매물 채널 구독

### 5. 상세보기 종료 시 정리
- 기존 `closeDetails()` 안에서:
  - 서버 이탈 호출
  - 실시간 연결 해제
  - count 초기화

### 6. UI 표시 위치 결정
- 우선 추천 위치:
  1. 상세 헤더 배지 영역 옆
  2. 요약 보기 카드 내부
  3. 관리자 목록

표시 문구 예시:
- `지금 3명 보는 중`
- `현재 1명 확인 중`

## 프론트 의사코드

```jsx
const viewerConnectionRef = useRef(null);
const viewerSessionId = getOrCreateViewerSessionId();

useEffect(() => {
  if (!selectedListingId) return;

  let closed = false;

  async function connect() {
    await enterListingViewerPresence(selectedListingId, viewerSessionId);
    const stream = createListingViewerStream(selectedListingId, viewerSessionId);
    viewerConnectionRef.current = stream;

    stream.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "listing_viewer_count" && data.listingId === selectedListingId) {
        setCurrentViewerCount(Number(data.viewerCount ?? 0));
      }
    };
  }

  connect();

  return () => {
    closed = true;
    viewerConnectionRef.current?.close?.();
    leaveListingViewerPresence(selectedListingId, viewerSessionId).catch(() => {});
  };
}, [selectedListingId]);
```

## 프론트에서 주의할 점

### 1. 같은 사용자의 중복 카운트
- 같은 탭에서 상세보기 재렌더링이 발생해도 중복 입장 처리되면 안 된다.
- effect 정리와 재구독 순서를 명확히 해야 한다.

### 2. 다른 매물로 빠르게 전환하는 경우
- A 매물 이탈보다 B 매물 입장이 먼저 갈 수 있다.
- 서버는 `listingId + viewerSessionId` 단위로 멱등하게 처리해야 한다.

### 3. 브라우저 종료
- 프론트의 leave 이벤트만 믿으면 안 된다.
- 서버 TTL 만료 정리를 반드시 둬야 한다.

### 4. 모바일 백그라운드
- 앱이 백그라운드로 내려간 상태를 계속 접속 중으로 볼지 정책을 정해야 한다.
- 보통 `visibilitychange`에서 숨김 상태가 길어지면 이탈 처리한다.

## 화면 반영 추천안
- 상세 헤더에 배지 형태:
  - `지금 4명 보는 중`
- 요약 카드에는 작게:
  - `실시간 조회 4`

## 프론트 작업 체크리스트
- 탭 단위 session id 생성
- 상세보기 입장 시 presence 등록
- 상세보기 종료 시 presence 해제
- 실시간 viewer count 구독
- 매물 전환 시 이전 구독 정리
- 페이지 종료/숨김 처리
- 0명일 때 문구 정책 확정
- 네트워크 실패 시 fallback UI 처리

## 추천 결론
- 현재 구조에서는 "상세보기 클릭"이 명확한 진입 시점이므로 구현 포인트가 좋다.
- 프론트는 상세 데이터 호출과 별개로 presence 연결만 추가하면 된다.
- 운영 안정성을 생각하면 "WebSocket + 서버 TTL 정리" 조합이 가장 안전하다.
