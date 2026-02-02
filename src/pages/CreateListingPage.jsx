import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createListing } from "../api/listingApi";

const LOAN_PRODUCTS = [
  { value: "HF_YOUTH", label: "HF 청년" },
  { value: "HUG_YOUTH", label: "HUG 청년" },
  { value: "LH", label: "LH" },
  { value: "SH", label: "SH" },
  { value: "SEOUL_RENT_DEPOSIT", label: "서울시 전세보증금" },
  { value: "SEOUL_NEWLY_MARRIED", label: "서울시 신혼부부" },
  { value: "GENERAL_JEONSE", label: "일반 전세대출" },
  { value: "KAKAO_BANK", label: "카카오 대출" },
  { value: "TOSS_BANK", label: "토스 대출" },
  { value: "K_BANK", label: "케이뱅크 대출" }
];

const DEFAULT_FORM = {
  address: "",
  note: "",
  parking: "AVAILABLE",
  elevator: "YES",
  pet: "AVAILABLE",
  contractType: "JEONSE",
  roomType: "ONE_ROOM",
  loanProducts: ["HF_YOUTH"],
  moveInDate: "",
  deposit: "",
  monthlyRent: ""
};

export default function CreateListingPage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [loading, setLoading] = useState(false);

  const isValidDate = useMemo(() => /^\d{4}-\d{2}-\d{2}$/.test(form.moveInDate), [form.moveInDate]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onLoanProductChange = (event) => {
    const { value, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      loanProducts: checked
        ? [...prev.loanProducts, value]
        : prev.loanProducts.filter((product) => product !== value)
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (!form.address.trim()) {
      setStatus({ type: "error", message: "주소를 입력해주세요." });
      return;
    }

    if (!isValidDate) {
      setStatus({ type: "error", message: "입주 가능일을 선택해주세요." });
      return;
    }

    if (form.loanProducts.length === 0) {
      setStatus({ type: "error", message: "대출상품을 최소 1개 이상 선택해주세요." });
      return;
    }

    setLoading(true);
    setStatus({ type: "idle", message: "" });

    try {
      await createListing({
        ...form,
        // Backward compatibility for APIs that still expect a single value.
        loanProduct: form.loanProducts[0],
        address: form.address.trim(),
        note: form.note.trim(),
        moveInDate: form.moveInDate.replaceAll("-", ""),
        deposit: Number(form.deposit),
        monthlyRent: Number(form.monthlyRent)
      });
      setStatus({ type: "success", message: "매물을 등록했습니다." });
      setForm(DEFAULT_FORM);
    } catch (error) {
      const errorType = error.details?.errorType;
      if (errorType === "INPUT_ERROR") {
        setStatus({ type: "error", message: "입력값을 확인해주세요." });
      } else {
        setStatus({ type: "error", message: "서버 오류가 발생했습니다. 다시 시도해주세요." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
        <h2>매물 등록</h2>
        <Link to="/" className="link-button">목록으로 가기</Link>
      </div>
      <form className="listing-form" onSubmit={onSubmit}>
        <label>
          주소
          <input name="address" value={form.address} onChange={onChange} placeholder="상세 주소 입력" required />
        </label>

        <label>
          비고
          <input name="note" value={form.note} onChange={onChange} placeholder="참고 메모" />
        </label>

        <label>
          주차
          <select name="parking" value={form.parking} onChange={onChange}>
            <option value="AVAILABLE">가능</option>
            <option value="UNAVAILABLE">불가</option>
            <option value="CHECK_REQUIRED">확인 필요</option>
          </select>
        </label>

        <label>
          엘리베이터
          <select name="elevator" value={form.elevator} onChange={onChange}>
            <option value="YES">있음</option>
            <option value="NO">없음</option>
          </select>
        </label>

        <label>
          반려동물
          <select name="pet" value={form.pet} onChange={onChange}>
            <option value="AVAILABLE">가능</option>
            <option value="UNAVAILABLE">불가</option>
            <option value="CHECK_REQUIRED">확인 필요</option>
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
          방 구조
          <select name="roomType" value={form.roomType} onChange={onChange}>
            <option value="ONE_ROOM">원룸</option>
            <option value="ONE_POINT_FIVE_ROOM">1.5룸</option>
            <option value="TWO_ROOM">투룸</option>
            <option value="THREE_ROOM">3룸</option>
            <option value="OTHER">기타</option>
          </select>
        </label>

        <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", gridColumn: "1 / -1" }}>
          <legend>대출상품 (중복 선택 가능)</legend>
          <div style={{ display: "flex", flexWrap: "nowrap", gap: "10px 16px", overflowX: "auto", whiteSpace: "nowrap" }}>
            {LOAN_PRODUCTS.map((product) => (
              <label key={product.value} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  className="loan-product-checkbox"
                  type="checkbox"
                  name="loanProducts"
                  value={product.value}
                  checked={form.loanProducts.includes(product.value)}
                  onChange={onLoanProductChange}
                  style={{ width: "20px", height: "20px" }}
                />
                {product.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          입주 가능일
          <input type="date" name="moveInDate" value={form.moveInDate} onChange={onChange} required />
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
          {loading ? "등록 중.." : "매물 등록하기"}
        </button>
      </form>

      {status.type !== "idle" && <p className={`status ${status.type}`}>{status.message}</p>}
    </section>
  );
}
