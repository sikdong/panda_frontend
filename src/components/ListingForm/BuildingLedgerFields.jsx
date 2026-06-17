import React from "react";

export default function BuildingLedgerFields({ form, onChange, onMoneyChange }) {
  return (
    <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
      <legend>건축물대장 정보</legend>
      <label>
        전용면적 (㎡)
        <input name="exclusivityArea" value={form.exclusivityArea || ""} onChange={onChange} placeholder="0.00" />
      </label>
      <label>
        사용승인일
        <input name="useAprDay" type="date" value={form.useAprDay || ""} onChange={onChange} />
      </label>
      <label>
        총층
        <input name="totalFloors" type="number" value={form.totalFloors || ""} onChange={onChange} placeholder="0" />
      </label>
      <label>
        해당층
        <input name="currentFloor" type="number" value={form.currentFloor || ""} onChange={onChange} placeholder="0" />
      </label>
      <label>
        주차가능대수
        <input name="parkingCount" type="number" value={form.parkingCount || ""} onChange={onChange} placeholder="0" />
      </label>
      <label>
        주차가능여부
        <select name="parking" value={form.parking || "AVAILABLE"} onChange={onChange}>
          <option value="AVAILABLE">가능</option>
          <option value="UNAVAILABLE">불가</option>
          <option value="CHECK_REQUIRED">확인 필요</option>
        </select>
      </label>
      <label>
        관리비
        <input name="maintenanceFee" type="text" inputMode="numeric" value={form.maintenanceFee || ""} onChange={onMoneyChange} placeholder="0" />
      </label>
      <label>
        융자여부
        <select name="loanStatus" value={form.loanStatus || "NONE"} onChange={onChange}>
          <option value="NONE">없음</option>
          <option value="BELOW_30">시세 융자금 30% 미만</option>
        </select>
      </label>
      <label>
        위반건축물여부
        <select name="illegalBuildingStatus" value={form.illegalBuildingStatus || "NO"} onChange={onChange}>
          <option value="NO">X</option>
          <option value="YES">O</option>
        </select>
      </label>
    </fieldset>
  );
}
