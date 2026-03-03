import {
  ROOM_TYPE_LABELS,
  LOAN_PRODUCT_LABELS,
  DETAIL_KEY_LABELS,
  PARKING_LABELS,
  ELEVATOR_LABELS,
  PET_LABELS,
  CONTRACT_TYPE_LABELS,
  LOAN_STATUS_LABELS,
  ILLEGAL_BUILDING_STATUS_LABELS
} from "../constants/mapListingConstants";

export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

export function formatMoneyInput(value) {
  const digitsOnly = String(value ?? "").replace(/\D/g, "");
  return digitsOnly ? Number(digitsOnly).toLocaleString("ko-KR") : "";
}

export function parseMoneyValue(value) {
  return Number(String(value ?? "").replace(/,/g, ""));
}

export function normalizeDateValue(value) {
  if (!value) return "";
  const asString = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) return asString;
  const digitsOnly = asString.replace(/\D/g, "");
  if (/^\d{8}$/.test(digitsOnly)) {
    return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 6)}-${digitsOnly.slice(6, 8)}`;
  }
  return "";
}

/**
 * 8자리 숫자(YYYYMMDD)를 YYYY-MM-DD 형식으로 변환
 */
export function formatDateString(val) {
  if (!val) return "";
  const d = String(val).replace(/\D/g, "");
  if (d.length === 8) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return val;
}

export function formatRoomType(value) {
  return ROOM_TYPE_LABELS[value] ?? value ?? "방 구조 정보 없음";
}

export function formatLoanProducts(value) {
  if (!Array.isArray(value) || value.length === 0) return "대출 유형 정보 없음";
  return value.map((item) => LOAN_PRODUCT_LABELS[item] ?? item).join(", ");
}

export function getHotPropertyValue(item) {
  return Boolean(item?.isHotProperty ?? item?.hotProperty ?? false);
}

export function getSoldValue(listing) {
  return Boolean(listing?.isSold ?? listing?.sold ?? listing?.saleCompleted ?? false);
}

export function normalizeString(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function getLatestTimestamp(listing) {
  const timestamp = Date.parse(listing?.createdAt ?? listing?.updatedAt ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getListingId(listing) {
  return listing?.id ?? listing?.listingId ?? null;
}

export function extractImageUrls(detail) {
  if (!detail || typeof detail !== "object") return [];
  if (!Array.isArray(detail.imagePaths) || detail.imagePaths.length === 0) return [];

  return detail.imagePaths
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return (item.presignedGetUrl ?? item.presignedUrl ?? item.getUrl ?? item.url ?? item.imageUrl ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

export function formatDetailKey(key) {
  return DETAIL_KEY_LABELS[key] ?? key;
}

export function formatMoveInDateDisplay(detail) {
  const moveInType = detail?.moveInType ?? "FIXED";
  const moveInDate = detail?.moveInDate;
  const moveInTypeLabel = detail?.moveInTypeLabel;

  if (moveInType === "NEGOTIABLE") {
    return (moveInDate && moveInTypeLabel) ? `${moveInDate} (${moveInTypeLabel})` : (moveInDate ?? moveInTypeLabel ?? "-");
  }
  if (moveInType === "FIXED") return moveInDate ?? "-";
  if (moveInType === "IMMEDIATE") return moveInTypeLabel ?? "-";
  return moveInDate ?? moveInTypeLabel ?? "-";
}

export function formatDetailValue(key, value) {
  if (["deposit", "monthlyRent", "viewCount", "maintenanceFee", "parkingCount", "totalFloors", "currentFloor", "exclusivityArea"].includes(key)) {
    return formatNumber(value);
  }
  if (key === "isHotProperty") return value ? "꿀매물" : "일반";
  if (key === "loanProducts") return formatLoanProducts(value);
  if (key === "roomType") return formatRoomType(value);
  if (key === "parking") return PARKING_LABELS[value] ?? value ?? "-";
  if (key === "elevator") return ELEVATOR_LABELS[value] ?? value ?? "-";
  if (key === "pet") return PET_LABELS[value] ?? value ?? "-";
  if (key === "contractType") return CONTRACT_TYPE_LABELS[value] ?? value ?? "-";
  if (key === "loanStatus") return LOAN_STATUS_LABELS[value] ?? value ?? "-";
  if (key === "illegalBuildingStatus") return ILLEGAL_BUILDING_STATUS_LABELS[value] ?? value ?? "-";
  if (value == null) return "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
