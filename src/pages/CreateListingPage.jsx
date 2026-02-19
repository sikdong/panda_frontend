import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createListing, fetchListingDetail, updateListing } from "../api/listingApi";

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

function formatMoneyInput(value) {
  const digitsOnly = String(value ?? "").replace(/\D/g, "");
  return digitsOnly ? Number(digitsOnly).toLocaleString("ko-KR") : "";
}

function parseMoneyValue(value) {
  return Number(String(value ?? "").replace(/,/g, ""));
}

function normalizeDateValue(value) {
  if (!value) {
    return "";
  }

  const asString = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
    return asString;
  }

  const digitsOnly = asString.replace(/\D/g, "");
  if (/^\d{8}$/.test(digitsOnly)) {
    return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 6)}-${digitsOnly.slice(6, 8)}`;
  }

  return "";
}

function getImageUrl(item) {
  if (typeof item === "string") {
    return item.trim();
  }
  if (item && typeof item === "object") {
    return (
      item.presignedGetUrl ??
      item.presignedUrl ??
      item.getUrl ??
      item.url ??
      item.imageUrl ??
      ""
    ).trim();
  }
  return "";
}

const DEFAULT_FORM = {
  address: "",
  hotProperty: false,
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

function toFormModel(detail) {
  if (!detail || typeof detail !== "object") {
    return DEFAULT_FORM;
  }

  const parsedLoanProducts = Array.isArray(detail.loanProducts) && detail.loanProducts.length > 0
    ? detail.loanProducts
    : DEFAULT_FORM.loanProducts;

  return {
    address: detail.address ?? "",
    hotProperty: Boolean(detail.hotProperty ?? detail.hotProperty ?? false),
    note: detail.note ?? "",
    parking: detail.parking ?? DEFAULT_FORM.parking,
    elevator: detail.elevator ?? DEFAULT_FORM.elevator,
    pet: detail.pet ?? DEFAULT_FORM.pet,
    contractType: detail.contractType ?? DEFAULT_FORM.contractType,
    roomType: detail.roomType ?? DEFAULT_FORM.roomType,
    loanProducts: parsedLoanProducts,
    moveInDate: normalizeDateValue(detail.moveInDate),
    deposit: formatMoneyInput(detail.deposit),
    monthlyRent: formatMoneyInput(detail.monthlyRent)
  };
}

function toExistingImages(detail) {
  if (!detail || !Array.isArray(detail.imagePaths)) {
    return [];
  }

  return detail.imagePaths
    .map((item, index) => {
      const url = getImageUrl(item);
      const filePath = Array.isArray(detail.imageFilePaths) ? detail.imageFilePaths[index] : null;
      return {
        id: `existing-${index}`,
        raw: item,
        filePath,
        url
      };
    })
    .filter((item) => Boolean(item.url));
}

export default function CreateListingPage() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(listingId);

  const [form, setForm] = useState(DEFAULT_FORM);
  const [existingImages, setExistingImages] = useState([]);
  const [serverImagePaths, setServerImagePaths] = useState([]);
  const [newImageFiles, setNewImageFiles] = useState([]);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [viewerImageUrl, setViewerImageUrl] = useState("");

  const imageSeqRef = useRef(0);

  const isValidDate = useMemo(() => !form.moveInDate || /^\d{4}-\d{2}-\d{2}$/.test(form.moveInDate), [form.moveInDate]);

  useEffect(() => {
    return () => {
      newImageFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [newImageFiles]);

  useEffect(() => {
    if (!isEditMode) {
      setInitialLoading(false);
      setForm(DEFAULT_FORM);
      setExistingImages([]);
      setServerImagePaths([]);
      setNewImageFiles((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return [];
      });
      setStatus({ type: "idle", message: "" });
      return;
    }

    let mounted = true;
    setInitialLoading(true);
    setStatus({ type: "idle", message: "" });

    (async () => {
      try {
        const response = await fetchListingDetail(listingId);
        const detail = response?.data ?? response;
        if (mounted) {
          setForm(toFormModel(detail));
          setExistingImages(toExistingImages(detail));
          setServerImagePaths(Array.isArray(detail?.imageFilePaths) ? detail.imageFilePaths : []);
          setNewImageFiles((prev) => {
            prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
            return [];
          });
        }
      } catch (error) {
        if (mounted) {
          setStatus({ type: "error", message: error.message ?? "매물 정보를 불러오지 못했습니다." });
        }
      } finally {
        if (mounted) {
          setInitialLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isEditMode, listingId]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onMoneyChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: formatMoneyInput(value) }));
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

  const onImageFilesChange = (event) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setNewImageFiles((prev) => [
      ...prev,
      ...files.map((file) => {
        imageSeqRef.current += 1;
        return {
          id: `new-${imageSeqRef.current}`,
          file,
          previewUrl: URL.createObjectURL(file)
        };
      })
    ]);

    event.target.value = "";
  };

  const removeExistingImage = (targetId) => {
    setExistingImages((prev) => {
      const target = prev.find((item) => item.id === targetId);
      if (target) {
        const targetPath = target.filePath ?? target.raw;
        setServerImagePaths((paths) => paths.filter((pathItem) => pathItem !== targetPath));
      }
      return prev.filter((item) => item.id !== targetId);
    });
  };

  const removeNewImage = (targetId) => {
    setNewImageFiles((prev) => {
      const target = prev.find((item) => item.id === targetId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== targetId);
    });
  };

  const openImageViewer = (url) => {
    if (!url) {
      return;
    }
    setViewerImageUrl(url);
  };

  const closeImageViewer = () => {
    setViewerImageUrl("");
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (!form.address.trim()) {
      setStatus({ type: "error", message: "주소를 입력해주세요." });
      return;
    }

    if (!isValidDate) {
      setStatus({ type: "error", message: "입주 가능일 형식을 확인해주세요." });
      return;
    }

    if (form.loanProducts.length === 0) {
      setStatus({ type: "error", message: "대출상품을 최소 1개 이상 선택해주세요." });
      return;
    }

    setLoading(true);
    setStatus({ type: "idle", message: "" });

    try {
      const listingPayload = {
        ...form,
        hotProperty: Boolean(form.hotProperty),
        address: form.address.trim(),
        note: form.note.trim(),
        moveInDate: form.moveInDate ? form.moveInDate.replaceAll("-", "") : "",
        deposit: parseMoneyValue(form.deposit),
        monthlyRent: parseMoneyValue(form.monthlyRent)
      };

      if (isEditMode) {
        const visibleNewImageFiles = newImageFiles.map((item) => item.file);
        const retainedImagePaths = serverImagePaths
          .map((item) => item.filePath ?? item.raw)
          .filter((item) => item !== null && item !== undefined);
        const hasVisibleImages = retainedImagePaths.length > 0 || visibleNewImageFiles.length > 0;
        listingPayload.imagePaths = serverImagePaths;
        setServerImagePaths(retainedImagePaths);
        if (hasVisibleImages) {
          const formData = new FormData();
          formData.append("listing", new Blob([JSON.stringify(listingPayload)], { type: "application/json" }));
          visibleNewImageFiles.forEach((file) => formData.append("images", file));
          await updateListing(listingId, formData);
        } else {
          await updateListing(listingId, listingPayload);
        }

        navigate("/admin/listings", { replace: true });
      } else {
        if (newImageFiles.length > 0) {
          const formData = new FormData();
          formData.append("listing", new Blob([JSON.stringify(listingPayload)], { type: "application/json" }));
          newImageFiles.forEach((item) => formData.append("images", item.file));
          await createListing(formData);
        } else {
          await createListing(listingPayload);
        }

        setStatus({ type: "success", message: "매물을 등록했습니다." });
        setForm(DEFAULT_FORM);
        setExistingImages([]);
      setServerImagePaths([]);
      setNewImageFiles((prev) => {
          prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
          return [];
        });
      }
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
        <h2>{isEditMode ? "매물 수정" : "매물 등록"}</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link to="/admin/listings" className="link-button">관리자 목록</Link>
          <Link to="/" className="link-button">목록으로 가기</Link>
        </div>
      </div>

      {initialLoading ? (
        <p>매물 정보를 불러오는 중...</p>
      ) : (
        <form className="listing-form" onSubmit={onSubmit}>
          <label>
            주소
            <input name="address" value={form.address} onChange={onChange} placeholder="상세 주소 입력" required />
          </label>

          <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              className="hot-property-checkbox"
              type="checkbox"
              name="hotProperty"
              checked={Boolean(form.hotProperty)}
              onChange={(event) => {
                const { checked } = event.target;
                setForm((prev) => ({ ...prev, hotProperty: checked }));
              }}
              style={{ width: 18, height: 18 }}
            />
            꿀매물
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
            <legend>대출상품</legend>
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
            <input type="date" name="moveInDate" value={form.moveInDate} onChange={onChange} />
          </label>

          <label>
            보증금
            <input name="deposit" type="text" inputMode="numeric" value={form.deposit} onChange={onMoneyChange} required />
          </label>

          <label>
            월세
            <input name="monthlyRent" type="text" inputMode="numeric" value={form.monthlyRent} onChange={onMoneyChange} required />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            이미지 파일 (여러 개 선택 가능)
            <input type="file" accept="image/*" multiple onChange={onImageFilesChange} />

            {existingImages.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: "#4b5a52", marginBottom: 6 }}>기존 이미지</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {existingImages.map((image) => (
                    <div key={image.id} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: "1px solid #d9dfdb" }}>
                      <img
                        src={image.url}
                        alt="기존 이미지"
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); openImageViewer(image.url); }}
                        style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
                      />
                      <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeExistingImage(image.id); }}
                        aria-label="기존 이미지 삭제"
                        style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 999, border: "1px solid #fff", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer", padding: 0 }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {newImageFiles.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: "#4b5a52", marginBottom: 6 }}>
                  새 이미지 {newImageFiles.length}개 선택됨
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {newImageFiles.map((item) => (
                    <div key={item.id} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: "1px solid #d9dfdb" }}>
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); openImageViewer(item.previewUrl); }}
                        style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
                      />
                      <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeNewImage(item.id); }}
                        aria-label="새 이미지 삭제"
                        style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 999, border: "1px solid #fff", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer", padding: 0 }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </label>

          <button type="submit" disabled={loading}>
            {loading ? (isEditMode ? "수정 중.." : "등록 중..") : (isEditMode ? "매물 수정하기" : "매물 등록하기")}
          </button>
        </form>
      )}

      {viewerImageUrl && (
        <div
          onClick={closeImageViewer}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.6)",
            display: "grid",
            placeItems: "center",
            padding: 16
          }}
        >
          <div onClick={(event) => event.stopPropagation()} style={{ position: "relative", maxWidth: "min(1100px, 96vw)", maxHeight: "90vh" }}>
            <button
              type="button"
              onClick={closeImageViewer}
              aria-label="이미지 닫기"
              style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 999, border: "1px solid #fff", background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer" }}
            >
              x
            </button>
            <img src={viewerImageUrl} alt="이미지 확대" style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 10, display: "block" }} />
          </div>
        </div>
      )}

      {status.type !== "idle" && <p className={`status ${status.type}`}>{status.message}</p>}
    </section>
  );
}















