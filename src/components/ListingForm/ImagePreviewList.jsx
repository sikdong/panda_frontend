import React from "react";

export default function ImagePreviewList({ title, images, onRemove, onOpenViewer }) {
  if (!images || images.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: "#4b5a52", marginBottom: 6 }}>
        {title} {title.includes("새") ? `${images.length}개 선택됨` : ""}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {images.map((img) => (
          <div key={img.id} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: "1px solid #d9dfdb" }}>
            <img
              src={img.url || img.previewUrl}
              alt="미리보기"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenViewer(img.url || img.previewUrl); }}
              style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
            />
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(img.id); }}
              aria-label="삭제"
              style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 999, border: "1px solid #fff", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer", padding: 0 }}
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
