import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDaumPostcodePopup } from "react-daum-postcode";
import { 
  createListing, 
  fetchListingEditDetail, 
  requestUploadUrls,
  updateListing, 
  fetchBuildingTitles, 
  fetchBuildingExclusivity 
} from "../api/listingApi";
import {
  formatMoneyInput,
  parseMoneyValue,
  normalizeDateValue,
  formatDateString,
} from "../utils/listingUtils";
import {
  normalizeUploadTargets,
  prepareImageFiles,
  uploadFilesInBatches,
  validateImageFiles
} from "../utils/imageUpload";
import BuildingLedgerFields from "../components/ListingForm/BuildingLedgerFields";
import ImagePreviewList from "../components/ListingForm/ImagePreviewList";

const LOAN_PRODUCTS = [
  { value: "HF_YOUTH", label: "HF 버팀목" },
  { value: "HUG_YOUTH", label: "HUG 버팀목" },
  { value: "LH", label: "LH" },
  { value: "SH", label: "SH" },
  { value: "SEOUL_RENT_DEPOSIT", label: "서울시 전세보증금" },
  { value: "SEOUL_NEWLY_MARRIED", label: "서울시 신혼부부" },
  { value: "GENERAL_JEONSE", label: "일반 전세대출" },
  { value: "KAKAO_BANK", label: "카카오 대출" },
  { value: "TOSS_BANK", label: "토스 대출" },
  { value: "K_BANK", label: "케이뱅크 대출" },
  { value: "CASH", label: "현금" }
];

const DEFAULT_FORM = {
  address: "",
  hotProperty: false,
  note: "",
  description: "",
  parking: "AVAILABLE",
  elevator: "YES",
  pet: "AVAILABLE",
  contractType: "JEONSE",
  roomType: "ONE_ROOM",
  loanProducts: ["HF_YOUTH"],
  moveInType: "NEGOTIABLE",
  moveInDate: "",
  deposit: "",
  monthlyRent: "",
  // 건축물대장 필드 수정
  exclusivityArea: "",
  useAprDay: "",
  totalFloors: "",
  currentFloor: "", // 해당층 추가
  parkingCount: "",
  // 추가 필드
  maintenanceFee: "",
  loanStatus: "NONE",
  illegalBuildingStatus: "NO"
};

function getImageUrl(item) {
  if (typeof item === "string") return item.trim();
  if (item && typeof item === "object") {
    return (item.presignedGetUrl ?? item.presignedUrl ?? item.getUrl ?? item.url ?? item.imageUrl ?? "").trim();
  }
  return "";
}

function parseOptionalNumber(value, { allowDecimal = false } = {}) {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (!normalized) return null;

  const parsed = allowDecimal ? Number(normalized) : Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFormModel(detail) {
  if (!detail || typeof detail !== "object") return DEFAULT_FORM;
  const parsedLoanProducts = Array.isArray(detail.loanProducts) && detail.loanProducts.length > 0
    ? detail.loanProducts
    : DEFAULT_FORM.loanProducts;

  return {
    ...DEFAULT_FORM,
    ...detail,
    hotProperty: Boolean(detail.hotProperty),
    loanProducts: parsedLoanProducts,
    moveInType: detail.moveInType ?? DEFAULT_FORM.moveInType,
    moveInDate: normalizeDateValue(detail.moveInDate),
    deposit: formatMoneyInput(detail.deposit),
    monthlyRent: formatMoneyInput(detail.monthlyRent),
    // 건축물대장 정보 매핑
    exclusivityArea: detail.exclusivityArea ?? "",
    useAprDay: formatDateString(detail.useAprDay) ?? "",
    totalFloors: detail.totalFloors ?? "",
    currentFloor: detail.currentFloor ?? "",
    parkingCount: detail.parkingCount ?? "",
    parking: detail.parking ?? DEFAULT_FORM.parking,
    // 추가 필드 매핑
    maintenanceFee: formatMoneyInput(detail.maintenanceFee),
    loanStatus: detail.loanStatus ?? DEFAULT_FORM.loanStatus,
    illegalBuildingStatus: detail.illegalBuildingStatus ?? DEFAULT_FORM.illegalBuildingStatus
  };
}

function toExistingImages(detail) {
  if (!detail || !Array.isArray(detail.imagePaths)) return [];
  return detail.imagePaths
    .map((item, index) => {
      const url = getImageUrl(item);
      const filePath = Array.isArray(detail.imageFilePaths) ? detail.imageFilePaths[index] : null;
      return { id: `existing-${index}`, raw: item, filePath, url };
    })
    .filter((item) => Boolean(item.url));
}

function extractListingId(response) {
  const rawData = response?.data ?? response;
  const candidate = rawData?.id ?? rawData?.listingId ?? response?.id ?? response?.listingId;
  const parsed = Number(candidate);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function CreateListingPage() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(listingId);
  const openPostcode = useDaumPostcodePopup();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [existingImages, setExistingImages] = useState([]);
  const [serverImagePaths, setServerImagePaths] = useState([]);
  const [newImageFiles, setNewImageFiles] = useState([]);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [viewerImageUrl, setViewerImageUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  
  const [showAddressDetailModal, setShowAddressDetailModal] = useState(false);
  const [tempBaseAddress, setTempBaseAddress] = useState("");
  const [manualBuildingName, setManualBuildingName] = useState("");
  const [localDetail, setLocalDetail] = useState("");
  const [buildingOptions, setBuildingOptions] = useState([]);
  const [selectedBuildingPk, setSelectedBuildingPk] = useState("");
  const [addressCodes, setAddressCodes] = useState(null);

  const imageSeqRef = useRef(0);
  const detailInputRef = useRef(null);

  const isValidDate = useMemo(() => !form.moveInDate || /^\d{4}-\d{2}-\d{2}$/.test(form.moveInDate), [form.moveInDate]);

  useEffect(() => {
    return () => newImageFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, [newImageFiles]);

  useEffect(() => {
    if (!isEditMode) {
      setInitialLoading(false); setForm(DEFAULT_FORM); setExistingImages([]); setServerImagePaths([]);
      setNewImageFiles((prev) => { prev.forEach((item) => URL.revokeObjectURL(item.previewUrl)); return []; });
      setUploadProgress({ done: 0, total: 0 });
      setStatus({ type: "idle", message: "" });
      return;
    }

    let mounted = true;
    setInitialLoading(true);
    (async () => {
      try {
        const response = await fetchListingEditDetail(listingId);
        const detail = response?.data ?? response;
        if (mounted) {
          setForm(toFormModel(detail));
          setExistingImages(toExistingImages(detail));
          setServerImagePaths(Array.isArray(detail?.imageFilePaths) ? detail.imageFilePaths : []);
          setNewImageFiles((prev) => { prev.forEach((item) => URL.revokeObjectURL(item.previewUrl)); return []; });
        }
      } catch (error) {
        if (mounted) setStatus({ type: "error", message: error.message ?? "매물 정보를 불러오지 못했습니다." });
      } finally {
        if (mounted) setInitialLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isEditMode, listingId]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      const nextForm = {
        ...prev,
        [name]: value,
        ...(name === "moveInType" && value === "IMMEDIATE" ? { moveInDate: "" } : {})
      };

      // 주차가능대수가 0보다 크면 '가능', 0이면 '불가'로 자동 변경
      if (name === "parkingCount") {
        const count = Number(value) || 0;
        if (count > 0) {
          nextForm.parking = "AVAILABLE";
        } else {
          nextForm.parking = "UNAVAILABLE";
        }
      }

      return nextForm;
    });
  };

  const handleCompletePostcode = async (data) => {
    let fullAddress = data.address;
    if (data.addressType === "R") {
      let extraAddress = (data.bname !== "" ? data.bname : "") + (data.buildingName !== "" ? (data.bname !== "" ? `, ${data.buildingName}` : data.buildingName) : "");
      fullAddress += extraAddress !== "" ? ` (${extraAddress})` : "";
    }
    
    setTempBaseAddress(fullAddress);
    setManualBuildingName("");
    setLocalDetail("");
    setShowAddressDetailModal(true);
    setBuildingOptions([]);
    setSelectedBuildingPk("");
    
    setTimeout(() => detailInputRef.current?.focus(), 100);

    try {
      const sigunguCd = data.sigunguCode;
      const bjdongCd = data.bcode.slice(5);
      // 지번 주소에서 번지와 호를 추출 (예: 123-45 -> bun: 123, ji: 45)
      const jibunAddr = data.jibunAddress || data.autoJibunAddress;
      const bunjiMatch = jibunAddr.match(/(\d+)(?:-(\d+))?$/);
      const platGbCd = jibunAddr.includes(" 산 ") ? "1" : "0";
      
      if (sigunguCd && bjdongCd && bunjiMatch) {
        const bun = bunjiMatch[1].padStart(4, "0");
        const ji = (bunjiMatch[2] || "0").padStart(4, "0");
        const codes = { sigunguCd, bjdongCd, platGbCd, bun, ji };
        setAddressCodes(codes);

        setStatus({ type: "idle", message: "건물(동) 목록 조회 중..." });
        const response = await fetchBuildingTitles(codes);
        
        // 백엔드 응답이 { data: [...] } 인지 아니면 그냥 [...] 인지 유연하게 처리
        const resData = response?.data ?? response;
        let items = [];
        if (Array.isArray(resData)) {
          items = resData;
        } else if (resData?.items?.item) {
          items = Array.isArray(resData.items.item) ? resData.items.item : [resData.items.item];
        }
        
        setBuildingOptions(items);

        if (items.length === 1) {
          const target = items[0];
          // PK가 없으면 동이름을 키로 사용
          setSelectedBuildingPk(target.mgmBldrgstPk || target.dongNm);
          setForm(prev => ({
            ...prev,
            useAprDay: formatDateString(target.useAprDay) || "",
            totalFloors: target.grndFlrCnt || "",
            parkingCount: target.parkingCount || "",
            parking: target.parking ? "AVAILABLE" : "UNAVAILABLE"
          }));
          setStatus({ type: "success", message: "건축물 정보를 자동으로 입력했습니다." });
        } else if (items.length > 1) {
          setStatus({ type: "success", message: `동 목록 ${items.length}건을 조회했습니다. 동을 선택해주세요.` });
        } else {
          setStatus({ type: "idle", message: "조회된 건물 정보가 없습니다." });
        }
      }
    } catch (e) {
      console.error("Fetch Building Titles Error:", e);
      setStatus({ type: "error", message: "건물 정보 조회 중 오류가 발생했습니다." });
    }
  };

  const onBuildingSelect = (e) => {
    const pk = e.target.value;
    setSelectedBuildingPk(pk);
    if (!pk) return;


    // mgmBldrgstPk 또는 dongNm으로 매칭 시도
    const target = buildingOptions.find(b => (b.mgmBldrgstPk || b.dongNm) === pk);

    if (target) {
      setForm(prev => ({
        ...prev,
        useAprDay: formatDateString(target.useAprDay) || "",
        totalFloors: target.grndFlrCnt || "",
        parkingCount: target.parkingCount || "",
        parking: target.parking ? "AVAILABLE" : "UNAVAILABLE"
      }));
    }
  };

  const onConfirmDetailAddress = async () => {
    const normalizedManualBuildingName = manualBuildingName.trim();
    const targetBuilding = buildingOptions.find(b => (b.mgmBldrgstPk || b.dongNm) === selectedBuildingPk);
    const selectedBuildingName = targetBuilding?.dongNm?.trim() || "";
    const resolvedBuildingName = selectedBuildingName || normalizedManualBuildingName;
    const finalAddress = [tempBaseAddress, resolvedBuildingName, localDetail.trim()].filter(Boolean).join(" ");
    setForm((prev) => ({ ...prev, address: finalAddress }));
    setShowAddressDetailModal(false);

    // 상세 주소 확정 시 전유부 조회 시도
    if (addressCodes) {
      try {
        // 상세 주소에서 '호' 추출 시도 (예: 202호 -> 202)
        const hoMatch = localDetail.match(/(\d+)\s*호/);
        const hoNm = hoMatch ? hoMatch[1] : localDetail.trim(); // 추출 실패 시 입력값 전체 사용

        setStatus({ type: "idle", message: "전유부 정보 조회 중..." });
        const response = await fetchBuildingExclusivity({
          ...addressCodes,
          dongNm: resolvedBuildingName,
          hoNm: hoNm
        });

        const resData = response?.data ?? response;

        // 제공해주신 데이터 구조: items.item[0].area 매핑
        const rawItem = resData?.items?.item;
        const targetItem = Array.isArray(rawItem) ? rawItem[0] : rawItem;
        
        const areaValue = targetItem?.area || resData?.exclusivityArea || resData?.area;
        const floorValue = targetItem?.flrNo;
        
        // 값이 하나라도 있으면 업데이트 진행
        if (areaValue || floorValue) {
          setForm(prev => ({
            ...prev,
            exclusivityArea: areaValue || prev.exclusivityArea,
            currentFloor: floorValue || prev.currentFloor
          }));
          setStatus({ type: "success", message: "전유부 정보를 확인했습니다." });
        } else {
          setStatus({ type: "idle", message: "" });
        }
      } catch (error) {
        console.error("Fetch Exclusivity Error:", error);
        setStatus({ type: "idle", message: "" });
      }
    }
  };

  const onSearchAddress = () => openPostcode({ onComplete: handleCompletePostcode });
  const onMoneyChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: formatMoneyInput(e.target.value) }));
  const onLoanProductChange = (e) => setForm((prev) => ({ ...prev, loanProducts: e.target.checked ? [...prev.loanProducts, e.target.value] : prev.loanProducts.filter((p) => p !== e.target.value) }));

  const onImageFilesChange = (e) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setNewImageFiles((prev) => [...prev, ...files.map((file) => ({ id: `new-${++imageSeqRef.current}`, file, previewUrl: URL.createObjectURL(file) }))]);
    e.target.value = "";
  };

  const removeExistingImage = (id) => setExistingImages((prev) => {
    const target = prev.find((i) => i.id === id);
    if (target) setServerImagePaths((paths) => paths.filter((p) => p !== (target.filePath ?? target.raw)));
    return prev.filter((i) => i.id !== id);
  });

  const removeNewImage = (id) => setNewImageFiles((prev) => {
    const target = prev.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    return prev.filter((i) => i.id !== id);
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.address.trim()) return setStatus({ type: "error", message: "주소를 입력해주세요." });
    if (!isValidDate) return setStatus({ type: "error", message: "입주 가능일 형식을 확인해주세요." });
    if (form.moveInType === "FIXED" && !form.moveInDate) return setStatus({ type: "error", message: "고정 선택 시 입주 가능일이 필요합니다." });
    if (form.loanProducts.length === 0) return setStatus({ type: "error", message: "대출상품을 최소 1개 이상 선택해주세요." });

    setLoading(true); setStatus({ type: "idle", message: "" });
    try {
      const sourceFiles = newImageFiles.map((item) => item.file);
      validateImageFiles(sourceFiles);

      let visibleNewFiles = sourceFiles;
      if (sourceFiles.length > 0) {
        setStatus({ type: "idle", message: `이미지 전처리 중... (0/${sourceFiles.length})` });
        visibleNewFiles = await prepareImageFiles(sourceFiles, (done, total) => {
          setStatus({ type: "idle", message: `이미지 전처리 중... (${done}/${total})` });
        });
      }

      const listingPayload = { 
        ...form, 
        hotProperty: Boolean(form.hotProperty), 
        address: form.address.trim(), 
        note: form.note.trim(), 
        description: form.description.trim(),
        moveInDate: form.moveInDate || null, 
        deposit: parseMoneyValue(form.deposit), 
        monthlyRent: parseMoneyValue(form.monthlyRent),
        exclusivityArea: parseOptionalNumber(form.exclusivityArea, { allowDecimal: true }),
        totalFloors: parseOptionalNumber(form.totalFloors),
        currentFloor: parseOptionalNumber(form.currentFloor),
        parkingCount: parseOptionalNumber(form.parkingCount),
        maintenanceFee: parseOptionalNumber(form.maintenanceFee)
      };

      let targetListingId = isEditMode ? Number(listingId) : null;
      if (isEditMode && (!Number.isInteger(targetListingId) || targetListingId <= 0)) {
        throw new Error("유효한 매물 ID를 확인하지 못했습니다.");
      }

      if (!isEditMode && visibleNewFiles.length > 0) {
        const createResponse = await createListing({ ...listingPayload, imagePaths: [] });
        targetListingId = extractListingId(createResponse);
        if (!targetListingId) {
          throw new Error("생성된 매물 ID를 확인하지 못했습니다.");
        }
      }

      let uploadedKeys = [];
      if (visibleNewFiles.length > 0) {
        if (!targetListingId) {
          throw new Error("이미지 업로드 대상 매물 ID가 없습니다.");
        }
        setUploadProgress({ done: 0, total: visibleNewFiles.length });
        setStatus({ type: "idle", message: `이미지 업로드 준비 중... (0/${visibleNewFiles.length})` });

        const uploadTargetResponse = await requestUploadUrls(
          targetListingId,
          visibleNewFiles.map((file) => ({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size
          }))
        );
        const uploadTargets = normalizeUploadTargets(uploadTargetResponse);

        if (uploadTargets.length !== visibleNewFiles.length || uploadTargets.some((item) => !item.key || !item.putUrl)) {
          throw new Error("업로드 URL 발급 응답이 올바르지 않습니다.");
        }

        let completedUploads = 0;
        uploadedKeys = await uploadFilesInBatches(
          visibleNewFiles.map((file, index) => ({ file, target: uploadTargets[index] })),
          () => {
            completedUploads += 1;
            setUploadProgress({ done: completedUploads, total: visibleNewFiles.length });
            setStatus({ type: "idle", message: `이미지 업로드 중... (${completedUploads}/${visibleNewFiles.length})` });
          }
        );
      }

      if (isEditMode) {
        listingPayload.imagePaths = [...serverImagePaths.filter((path) => path != null), ...uploadedKeys];
        await updateListing(targetListingId, listingPayload);
        navigate("/admin/listings", { replace: true });
      } else {
        if (targetListingId) {
          await updateListing(targetListingId, { imagePaths: uploadedKeys });
        } else {
          listingPayload.imagePaths = [];
          await createListing(listingPayload);
        }
        setStatus({ type: "success", message: "매물을 등록했습니다." }); setForm(DEFAULT_FORM); setExistingImages([]); setServerImagePaths([]); setNewImageFiles((prev) => { prev.forEach((i) => URL.revokeObjectURL(i.previewUrl)); return []; });
        setUploadProgress({ done: 0, total: 0 });
      }
    } catch (err) {
      setStatus({ type: "error", message: err.message ?? (err.details?.errorType === "INPUT_ERROR" ? "입력값을 확인해주세요." : "서버 오류가 발생했습니다.") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
        <h2>{isEditMode ? "매물 수정" : "매물 등록"}</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link to="/admin/listings" className="link-button">관리자 목록</Link>
          <Link to="/" className="link-button">목록으로 가기</Link>
        </div>
      </div>

      {initialLoading ? <p>매물 정보를 불러오는 중...</p> : (
        <form className="listing-form" onSubmit={onSubmit}>
          <label style={{ gridColumn: "1 / -1" }}>
            주소
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <input name="address" value={form.address} onChange={onChange} placeholder="주소 검색을 이용해주세요" required style={{ flex: 1 }} />
              <button type="button" onClick={onSearchAddress} style={{ width: "auto", padding: "0 12px", whiteSpace: "nowrap" }}>주소 검색</button>
            </div>
          </label>

          <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input className="hot-property-checkbox" type="checkbox" name="hotProperty" checked={Boolean(form.hotProperty)} onChange={(e) => setForm((p) => ({ ...p, hotProperty: e.target.checked }))} style={{ width: 18, height: 18 }} />
            꿀매물
          </label>

          <label>비고 <input name="note" value={form.note} onChange={onChange} placeholder="참고 메모" /></label>
          <label>엘리베이터 <select name="elevator" value={form.elevator} onChange={onChange}><option value="YES">있음</option><option value="NO">없음</option></select></label>
          <label>반려동물 <select name="pet" value={form.pet} onChange={onChange}><option value="AVAILABLE">가능</option><option value="UNAVAILABLE">불가</option><option value="CHECK_REQUIRED">확인 필요</option></select></label>
          <label>계약 형태 <select name="contractType" value={form.contractType} onChange={onChange}><option value="JEONSE">전세</option><option value="SEMI_JEONSE">반전세</option><option value="MONTHLY_RENT">월세</option></select></label>
          <label>방 구조 <select name="roomType" value={form.roomType} onChange={onChange}><option value="ONE_ROOM">원룸</option><option value="ONE_POINT_FIVE_ROOM">1.5룸</option><option value="TWO_ROOM">투룸</option><option value="THREE_ROOM">3룸</option><option value="OTHER">기타</option></select></label>

          <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", gridColumn: "1 / -1" }}>
            <legend>대출상품</legend>
            <div style={{ display: "flex", flexWrap: "nowrap", gap: "10px 16px", overflowX: "auto", whiteSpace: "nowrap" }}>
              {LOAN_PRODUCTS.map((p) => (
                <label key={p.value} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input className="loan-product-checkbox" type="checkbox" name="loanProducts" value={p.value} checked={form.loanProducts.includes(p.value)} onChange={onLoanProductChange} style={{ width: "20px", height: "20px" }} />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div style={{ display: "grid", gridColumn: "1 / -1", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label>입주 옵션 <select name="moveInType" value={form.moveInType} onChange={onChange}><option value="NEGOTIABLE">협의필요</option><option value="FIXED">지정날짜 </option><option value="IMMEDIATE">공실(즉시입주)</option></select></label>
            {form.moveInType !== "IMMEDIATE" && <label>입주 가능일 <input type="date" name="moveInDate" value={form.moveInDate} onChange={onChange} /></label>}
          </div>

          <label>보증금 <input name="deposit" type="text" inputMode="numeric" value={form.deposit} onChange={onMoneyChange} required /></label>
          <label>월세 <input name="monthlyRent" type="text" inputMode="numeric" value={form.monthlyRent} onChange={onMoneyChange} required /></label>

          <BuildingLedgerFields form={form} onChange={onChange} onMoneyChange={onMoneyChange} />

          <label style={{ gridColumn: "1 / -1" }}>
            이미지 파일 (여러 개 선택 가능)
            <input type="file" accept="image/*" multiple onChange={onImageFilesChange} />
            <ImagePreviewList title="기존 이미지" images={existingImages} onRemove={removeExistingImage} onOpenViewer={setViewerImageUrl} />
            <ImagePreviewList title="새 이미지" images={newImageFiles} onRemove={removeNewImage} onOpenViewer={setViewerImageUrl} />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            메모
            <textarea
              name="description"
              value={form.description}
              onChange={onChange}
              placeholder="관리자용 메모"
              rows={8}
              style={{ minHeight: "220px", fontSize: "16px", lineHeight: 1.6, padding: "12px" }}
            />
          </label>

          <button type="submit" disabled={loading}>{loading ? (isEditMode ? "수정 중.." : "등록 중..") : (isEditMode ? "매물 수정하기" : "매물 등록하기")}</button>
        </form>
      )}

      {viewerImageUrl && (
        <div onClick={() => setViewerImageUrl("")} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "min(1100px, 96vw)", maxHeight: "90vh" }}>
            <button type="button" onClick={() => setViewerImageUrl("")} aria-label="닫기" style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 999, border: "1px solid #fff", background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer" }}>x</button>
            <img src={viewerImageUrl} alt="확대" style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 10, display: "block" }} />
          </div>
        </div>
      )}

      {status.type !== "idle" && <p className={`status ${status.type}`}>{status.message}</p>}
      {loading && uploadProgress.total > 0 && <p className="status">이미지 업로드 진행률: {uploadProgress.done}/{uploadProgress.total}</p>}

      {showAddressDetailModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", padding: "24px", borderRadius: "16px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 16px" }}>상세 주소 입력</h3>
            <div style={{ fontSize: "14px", color: "#666", marginBottom: "12px" }}>{tempBaseAddress}</div>
            
            {buildingOptions.length > 0 ? (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>동 선택 (필수)</label>
                <select 
                  value={selectedBuildingPk} 
                  onChange={onBuildingSelect}
                  style={{ width: "100%", minHeight: "44px", padding: "0 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "16px" }}
                >
                  <option value="">동을 선택해주세요</option>
                  {buildingOptions.map((b, idx) => (
                    <option key={b.mgmBldrgstPk || b.dongNm || idx} value={b.mgmBldrgstPk || b.dongNm}>
                      {b.dongNm || "동명칭 없음"} ({b.mainPurpsCdNm || "용도 미지정"})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: "16px", padding: "10px", background: "#f9f9f9", borderRadius: "8px", fontSize: "12px", color: "#888" }}>
                {status.message === "건물(동) 목록 조회 중..." ? "동 목록을 불러오는 중입니다..." : "이 주소지는 조회된 동 정보가 없습니다."}
              </div>
            )}

            {buildingOptions.length === 0 && status.message !== "건물(동) 목록 조회 중..." && (
              <>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>동명 (수동 입력)</label>
                <input
                  type="text"
                  value={manualBuildingName}
                  onChange={(e) => setManualBuildingName(e.target.value)}
                  placeholder="예: 101동"
                  style={{ width: "100%", minHeight: "44px", padding: "0 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "16px", marginBottom: "16px" }}
                />
              </>
            )}

            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>상세 주소 (호수 등)</label>
            <input
              ref={detailInputRef}
              type="text"
              value={localDetail}
              onChange={(e) => setLocalDetail(e.target.value)}
              placeholder="예: 202호"
              onKeyDown={(e) => { if (e.key === "Enter") onConfirmDetailAddress(); }}
              style={{ width: "100%", minHeight: "44px", padding: "0 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "16px", marginBottom: "20px" }}
            />
            
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={() => setShowAddressDetailModal(false)} style={{ flex: 1, height: "44px", borderRadius: "8px", border: "1px solid #ddd", background: "#f5f5f5", cursor: "pointer" }}>취소</button>
              <button type="button" onClick={onConfirmDetailAddress} style={{ flex: 1, height: "44px", borderRadius: "8px", border: "none", background: "var(--panda-bamboo)", color: "#fff", fontWeight: "700", cursor: "pointer" }}>확인</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
