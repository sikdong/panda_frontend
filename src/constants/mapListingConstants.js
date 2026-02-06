export const COORDINATE_GROUP_DECIMALS = 6;

export const LOAN_PRODUCT_LABELS = {
  HF_YOUTH: "HF 청년",
  HUG_YOUTH: "HUG 청년",
  LH: "LH",
  SH: "SH",
  SEOUL_RENT_DEPOSIT: "서울시 전세보증금",
  SEOUL_NEWLY_MARRIED: "서울시 신혼부부",
  GENERAL_JEONSE: "일반 전세대출",
  KAKAO_BANK: "카카오 대출",
  TOSS_BANK: "토스 대출",
  K_BANK: "케이뱅크 대출"
};

export const ROOM_TYPE_LABELS = {
  ONE_ROOM: "원룸",
  ONE_POINT_FIVE_ROOM: "1.5룸",
  TWO_ROOM: "투룸",
  THREE_ROOM: "3룸",
  OTHER: "기타"
};
export const ROOM_TYPE_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "ONE_ROOM", label: "원룸" },
  { value: "ONE_POINT_FIVE_ROOM", label: "1.5룸" },
  { value: "TWO_ROOM", label: "2룸" },
  { value: "THREE_ROOM", label: "3룸" }
];

export const LOAN_FILTER_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "TYPE_126", label: "126% 매물 (HUG 버팀목, LH, SH, 서울시 전세보증금, 서울시 신혼부부, 일반 전세대출, 카카오 대출, 토스 대출, 케이뱅크 대출)" },
  { value: "INSURANCE_AVAILABLE", label: "보증보험가입가능 (현금, HF 버팀목)" }
];

export const LOAN_126_PRODUCTS = new Set([
  "HUG_YOUTH",
  "LH",
  "SH",
  "SEOUL_RENT_DEPOSIT",
  "SEOUL_NEWLY_MARRIED",
  "GENERAL_JEONSE",
  "KAKAO_BANK",
  "TOSS_BANK",
  "K_BANK"
]);

export const INSURANCE_AVAILABLE_PRODUCTS = new Set(["CASH", "HF_YOUTH"]);

export const DETAIL_KEY_LABELS = {
  id: "매물 ID",
  listingId: "매물 ID",
  address: "주소",
  note: "비고",
  parking: "주차",
  elevator: "엘리베이터",
  pet: "반려동물",
  contractType: "계약 형태",
  roomType: "방 구조",
  loanProducts: "대출 유형",
  moveInDate: "입주 가능일",
  deposit: "보증금",
  monthlyRent: "월세",
  createdAt: "등록일시",
  updatedAt: "수정일시"
};

export const PARKING_LABELS = {
  AVAILABLE: "가능",
  UNAVAILABLE: "불가",
  CHECK_REQUIRED: "확인 필요"
};

export const ELEVATOR_LABELS = {
  YES: "있음",
  NO: "없음"
};

export const PET_LABELS = {
  AVAILABLE: "가능",
  UNAVAILABLE: "불가",
  CHECK_REQUIRED: "확인 필요"
};

export const CONTRACT_TYPE_LABELS = {
  JEONSE: "전세",
  SEMI_JEONSE: "반전세",
  MONTHLY_RENT: "월세"
};

export const DETAIL_PRIORITY_KEYS = ["address", "deposit", "monthlyRent", "roomType"];

export const SHEET_TRANSLATE = {
  closed: 100,
  half: 46,
  full: 0
};

