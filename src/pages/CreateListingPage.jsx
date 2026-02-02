import { useMemo, useState } from "react";
import { createListing } from "../api/listingApi";

const DEFAULT_FORM = {
  address: "",
  note: "",
  parking: "AVAILABLE",
  elevator: "YES",
  pet: "AVAILABLE",
  contractType: "JEONSE",
  roomType: "ONE_ROOM",
  loanProduct: "HF_YOUTH",
  moveInDate: "",
  deposit: "",
  monthlyRent: ""
};

export default function CreateListingPage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [loading, setLoading] = useState(false);

  const isValidDate = useMemo(() => /^\d{8}$/.test(form.moveInDate), [form.moveInDate]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (!form.address.trim()) {
      setStatus({ type: "error", message: "주소를 입력해 주세요." });
      return;
    }

    if (!isValidDate) {
      setStatus({ type: "error", message: "입주 날짜는 YYYYMMDD 형식이어야 합니다." });
      return;
    }

    setLoading(true);
    setStatus({ type: "idle", message: "" });

    try {
      await createListing({
        ...form,
        address: form.address.trim(),
        note: form.note.trim(),
        deposit: Number(form.deposit),
        monthlyRent: Number(form.monthlyRent)
      });
      setStatus({ type: "success", message: "매물이 정상적으로 저장되었습니다." });
      setForm(DEFAULT_FORM);
    } catch (error) {
      const errorType = error.details?.errorType;
      if (errorType === "INPUT_ERROR") {
        setStatus({ type: "error", message: "입력값을 다시 확인해 주세요." });
      } else {
        setStatus({ type: "error", message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>매물 등록</h2>
      <form className="listing-form" onSubmit={onSubmit}>
        <label>
          매물 주소
          <input name="address" value={form.address} onChange={onChange} placeholder="전체 주소" required />
        </label>

        <label>
          특이사항
          <input name="note" value={form.note} onChange={onChange} placeholder="참고/비고" />
        </label>

        <label>
          주차
          <select name="parking" value={form.parking} onChange={onChange}>
            <option value="AVAILABLE">가능</option>
            <option value="UNAVAILABLE">불가능</option>
            <option value="CHECK_REQUIRED">확인필요</option>
          </select>
        </label>

        <label>
          엘리베이터
          <select name="elevator" value={form.elevator} onChange={onChange}>
            <option value="YES">유</option>
            <option value="NO">무</option>
          </select>
        </label>

        <label>
          반려동물
          <select name="pet" value={form.pet} onChange={onChange}>
            <option value="AVAILABLE">가능</option>
            <option value="UNAVAILABLE">불가능</option>
            <option value="CHECK_REQUIRED">확인필요</option>
          </select>
        </label>

        <label>
          계약 형태
          <select name="contractType" value={form.contractType} onChange={onChange}>
            <option value="JEONSE">전세</option>
            <option value="SEMI_JEONSE">반전세</option>
            <option value="MONTHLY_RENT">월세</option>
          </select>
        </label>

        <label>
          룸 타입
          <select name="roomType" value={form.roomType} onChange={onChange}>
            <option value="ONE_ROOM">1룸</option>
            <option value="ONE_POINT_FIVE_ROOM">1.5룸</option>
            <option value="TWO_ROOM">2룸</option>
            <option value="THREE_ROOM">3룸</option>
            <option value="OTHER">그 외</option>
          </select>
        </label>

        <label>
          대출 상품
          <select name="loanProduct" value={form.loanProduct} onChange={onChange}>
            <option value="HF_YOUTH">HF 청년버팀목</option>
            <option value="HUG_YOUTH">HUG 청년버팀목</option>
            <option value="LH">LH</option>
            <option value="SH">SH</option>
            <option value="SEOUL_RENT_DEPOSIT">서울시 임차보증금 대출</option>
            <option value="SEOUL_NEWLY_MARRIED">서울시 신혼부부 대출</option>
            <option value="GENERAL_JEONSE">일반 전세대출</option>
            <option value="FINTECH_BANK">카카오 / 토스 / 케이뱅크 대출</option>
          </select>
        </label>

        <label>
          입주 날짜
          <input name="moveInDate" value={form.moveInDate} onChange={onChange} placeholder="YYYYMMDD" required />
        </label>

        <label>
          보증금
          <input name="deposit" type="number" min="0" value={form.deposit} onChange={onChange} required />
        </label>

        <label>
          월세
          <input name="monthlyRent" type="number" min="0" value={form.monthlyRent} onChange={onChange} required />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "저장 중..." : "매물 저장"}
        </button>
      </form>

      {status.type !== "idle" && <p className={`status ${status.type}`}>{status.message}</p>}
    </section>
  );
}
