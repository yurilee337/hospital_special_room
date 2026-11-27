import { useEffect, useRef, useState } from "react";

import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  BarChart3,
  Check,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileDown,
  Lock,
  LogOut,
  QrCode,
  Search,
  Star,
  TriangleAlert,
  User,
} from "lucide-react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import Swal from "sweetalert2";
import { QRCodeSVG } from "qrcode.react";
import api, { getErrorMessage } from "./services/api";

let pdfJsPromise; //โหลดตัวอ่านไฟล์ PDF แบบ Lazy Load
function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjsLib, workerUrl]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default;
      return pdfjsLib;
    });
  }
  return pdfJsPromise;
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
);

const topicLabels = {
  room_cleanliness: "ความสะอาดในห้องพัก",
  bathroom_cleanliness: "ความสะอาดของห้องน้ำ",
  overall_satisfaction: "ความพึงพอใจโดยรวมของห้องพิเศษ",
};
const respondentLabels = {
  patient: "ผู้ป่วย",
  relative: "ญาติ",
  other: "อื่นๆ",
};
const evaluationTopics = [
  "room_cleanliness",
  "bathroom_cleanliness",
  "overall_satisfaction",
];

const problemImageUrl = (imageId) =>
  `${api.defaults.baseURL.replace(/\/+$/, "")}/admin/problem-images/${imageId}`; //การตัดเครื่องหมาย / ส่วนเกินออกจาก Base URL

function Alert({ error }) {
  return error ? (
    <div className="alert alert-danger" role="alert">
      {error}
    </div>
  ) : null;
}

function EvaluationForm() {
  const location = useLocation();
  const qrToken = new URLSearchParams(location.search).get("qr") || ""; //ดึงรหัส QR Code จาก URL
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(Boolean(qrToken));
  const [categories, setCategories] = useState([]);
  const [images, setImages] = useState([]);
  const handleAddImages = (event) => {
    const newFiles = Array.from(event.target.files || []);
    if (!newFiles.length) return;

    setImages((prev) => {
      // นำรูปใหม่มาต่อท้ายรูปเดิม และจำกัดรวมกันไม่เกิน 3 รูป
      const combined = [...prev, ...newFiles];
      return combined.slice(0, 3);
    });

    // รีเซ็ตค่า input เพื่อให้สามารถเลือกรูปเดิมซ้ำ หรือถ่ายรูปเพิ่มได้เรื่อยๆ
    event.target.value = "";
  };

  const removeImage = (indexToRemove) => {
    setImages((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const toggleCategory = (id) =>
    setForm((previous) => ({
      ...previous,
      problem_category_ids: previous.problem_category_ids.includes(id)
        ? previous.problem_category_ids.filter((item) => item !== id)
        : [...previous.problem_category_ids, id],
    }));
  const categorySectionRef = useRef(null);
  const evidenceSectionRef = useRef(null);

  const [fieldErrors, setFieldErrors] = useState({
    categories: "",
    evidence: "",
  });
  const [shakeField, setShakeField] = useState({
    categories: false,
    evidence: false,
  });

  function triggerFieldAttention(fieldKey, message, ref) {
    setFieldErrors((prev) => ({ ...prev, [fieldKey]: message }));
    setShakeField((prev) => ({ ...prev, [fieldKey]: false }));

    requestAnimationFrame(() => {
      setShakeField((prev) => ({ ...prev, [fieldKey]: true }));
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });

    setTimeout(() => {
      setShakeField((prev) => ({ ...prev, [fieldKey]: false }));
    }, 450);
  }
  const [form, setForm] = useState({
    bed_id: "",
    respondent_type: "patient",
    has_problem: false,
    problem_description: "",
    suggestion: "",
    problem_category_ids: [],
    scores: evaluationTopics.reduce((a, key) => ({ ...a, [key]: 5 }), {}),
  });

  const [error, setError] = useState(
    qrToken ? "" : "กรุณาสแกน QR Code ประจำอาคารเพื่อเริ่มทำแบบประเมิน",
  );

  //ดักจับกรณีไม่มีรหัส QR Code
  useEffect(() => {
    if (!qrToken) {
      setSurvey(null);
      setLoading(false);
      setError("กรุณาสแกน QR Code ประจำอาคารเพื่อเริ่มทำแบบประเมิน");
      return;
    }
    setSurvey(null); //รีเซ็ตสถานะหน้าจอให้พร้อมโหลดข้อมูลใหม่
    setLoading(true);
    setError("");
    Promise.all([
      api.get(`/qr/${encodeURIComponent(qrToken)}`), //สั่งดึงข้อมูล 2 อย่างจาก Express Backend
      api.get("/problem-categories"),
    ])
      .then(([surveyResponse, categoryResponse]) => {
        setSurvey(surveyResponse.data);
        setCategories(categoryResponse.data);
        setForm((previous) => ({
          ...previous, //ตั้งค่าเตียงอัตโนมัติ
          bed_id: surveyResponse.data.locked_bed //ล็อกเตียงอัตโนมัติถ้ามีการกำหนดเตียงไว้แล้ว
            ? String(surveyResponse.data.locked_bed.bed_id)
            : "", //ถ้าไม่มีการล็อกเตียง ให้คงค่าเดิม
        }));
      })
      .catch((error) => setError(getErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [qrToken]); //ให้รันโค้ดทั้งหมดนี้ใหม่เฉพาะตอนที่เปิดหน้าเว็บครั้งแรก หรือตอนที่ค่า qrToken ใน URL เปลี่ยนไปเท่านั้น
  const [buttonStatus, setButtonStatus] = useState("idle"); // 'idle' | 'loading' | 'success'
  async function submit(event) {
    event.preventDefault();

    if (form.has_problem) {
      const hasCategory = form.problem_category_ids.length > 0;
      const hasDescription = form.problem_description.trim().length > 0;
      const hasImage = images.length > 0;

      if (!hasCategory) {
        triggerFieldAttention(
          "categories",
          "กรุณาเลือกประเภทปัญหาอย่างน้อย 1 ข้อ",
          categorySectionRef,
        );
        return;
      }

      if (!hasDescription && !hasImage) {
        triggerFieldAttention(
          "evidence",
          "กรุณากรอกรายละเอียดเพิ่มเติม หรือแนบรูปภาพอย่างน้อย 1 อย่าง",
          evidenceSectionRef,
        );
        return;
      }
    }

    setError("");
    setButtonStatus("loading"); // เริ่มสถานะกำลังส่ง

    const data = new FormData();
    data.append("qr_token", qrToken);
    data.append("bed_id", form.bed_id);
    data.append("respondent_type", form.respondent_type);
    data.append("has_problem", form.has_problem ? "1" : "0");
    data.append("suggestion", form.suggestion);
    data.append("problem_description", form.problem_description);
    data.append(
      "problem_category_ids",
      JSON.stringify(form.problem_category_ids),
    );
    data.append(
      "scores",
      JSON.stringify(
        Object.entries(form.scores).map(([topic_code, score]) => ({
          topic_code,
          score: Number(score),
        })),
      ),
    );
    images.forEach((image) => data.append("images", image));

    try {
      // ส่งข้อมูลไปหลังบ้าน
      await api.post("/evaluations", data);

      // 2. เมื่อส่งสำเร็จ เปลี่ยนปุ่มเป็นสถานะติ๊กถูกสีเขียว
      setButtonStatus("success");

      // 3. หน่วงเวลาเล็กน้อยเพื่อให้ผู้ใช้เห็นปุ่มติ๊กถูกสีเขียวก่อนขึ้น SweetAlert
      setTimeout(async () => {
        const result = await Swal.fire({
          title: "ขอบคุณสำหรับความคิดเห็น",
          text: "ส่งแบบประเมินเรียบร้อยแล้ว",
          icon: "success",
          confirmButtonText: "เรียบร้อย",
          allowOutsideClick: false,
          allowEscapeKey: false,
        });

        if (result.isConfirmed) {
          window.location.href = window.location.pathname;
        }
      }, 200);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setButtonStatus("idle"); // ถ้าส่งไม่ผ่าน ให้คืนค่าปุ่มกลับเป็นปกติ
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  return (
    <main className="survey-page">
      <style>{`
  @keyframes gformShake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-6px); }
    80% { transform: translateX(6px); }
  }
  .gform-shake {
    animation: gformShake 0.42s ease-in-out;
  }
  .gform-error-box {
    border: 1.5px solid #dc3545 !important;
    background-color: #fff8f8;
    border-radius: 10px;
    padding: 12px;
  }
  .gform-error-text {
    color: #dc3545;
    font-size: 0.875rem;
    font-weight: 500;
    margin-top: 6px;
  }
`}</style>
      <div className="survey-topbar">
        <img
          className="hospital-logo"
          src="/hospital-logo.jpg"
          alt="โลโก้โรงพยาบาลร้อยเอ็ด"
          width="38"
          height="38"
        />
        <span>โรงพยาบาลร้อยเอ็ด</span>
        <Link to="/admin/login" className="admin-entry">
          ผู้ดูแลระบบ
        </Link>
      </div>
      <div className="survey-wrap">
        <div className="survey-heading">
          <div className="eyebrow">YOUR VOICE MATTERS</div>
          <h1>
            ประเมินความพึงพอใจ
            <br />
            <span>ห้องพิเศษ</span>
          </h1>
          <p>ความคิดเห็นของคุณช่วยให้เราพัฒนาการดูแลและบริการให้ดียิ่งขึ้น</p>
        </div>
        <form className="survey-card" onSubmit={submit}>
          <Alert error={error} />
          <section className="form-section">
            <div className="section-title">
              <span>01</span>
              <div>
                <h2>ข้อมูลการเข้าพัก</h2>
                <p>อาคารถูกกำหนดจาก QR Code ที่สแกน</p>
              </div>
            </div>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label">อาคาร</label>
                <div className="form-control bg-light" aria-live="polite">
                  {loading
                    ? "กำลังตรวจสอบ QR Code..."
                    : survey?.building_name || "ไม่พบอาคารจาก QR Code"}
                </div>
              </div>
              <div className="col-12">
                <label className="form-label">เลือกเตียง (ไม่บังคับ)</label>
                <select
                  className="form-select"
                  value={form.bed_id}
                  onChange={(event) =>
                    setForm({ ...form, bed_id: event.target.value })
                  }
                  disabled={!survey || loading || Boolean(survey?.locked_bed)}
                >
                  <option value="">ไม่ระบุเตียง</option>
                  {survey?.wards.map((ward) => (
                    <optgroup key={ward.ward_id} label={ward.ward_name}>
                      {ward.beds.map((bed) => (
                        <option key={bed.bed_id} value={bed.bed_id}>
                          {bed.bed_name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {survey?.locked_bed && (
                  <small className="text-muted d-block mt-2">
                    QR Code นี้กำหนดเตียง {survey.locked_bed.bed_name} ไว้แล้ว
                  </small>
                )}
                {survey && !survey.wards.some((ward) => ward.beds.length) && (
                  <small className="text-muted d-block mt-2">
                    อาคารนี้ยังไม่มีเตียงที่เปิดใช้งาน
                    สามารถส่งแบบประเมินโดยไม่ระบุเตียงได้
                  </small>
                )}
              </div>
              <div className="col-12">
                <label className="form-label">กำลังตอบแบบประเมินในฐานะ</label>
                <div className="choice-row">
                  {[
                    ["patient", "ผู้ป่วย"],
                    ["relative", "ญาติผู้ป่วย"],
                    ["other", "อื่นๆ"],
                  ].map(([value, label]) => (
                    <label
                      className={`choice-tile ${form.respondent_type === value ? "selected" : ""}`}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="respondent"
                        value={value}
                        checked={form.respondent_type === value}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            respondent_type: event.target.value,
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section className="form-section">
            <div className="section-title">
              <span>02</span>
              <div>
                <h2>ความพึงพอใจ</h2>
                <p>ให้คะแนนแต่ละหัวข้อ ตั้งแต่ 1 (ควรปรับปรุง) ถึง 5 (ดีมาก)</p>
              </div>
            </div>
            <div className="rating-list">
              {evaluationTopics.map((key) => (
                <div className="rating-row" key={key}>
                  <span>{topicLabels[key]}</span>
                  <div className="rating-options">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <label
                        key={score}
                        className={
                          Number(form.scores[key]) === score ? "active" : ""
                        }
                      >
                        <input
                          type="radio"
                          name={key}
                          value={score}
                          checked={Number(form.scores[key]) === score}
                          onChange={() =>
                            setForm({
                              ...form,
                              scores: { ...form.scores, [key]: score },
                            })
                          }
                        />
                        <Star
                          size={15}
                          fill={
                            Number(form.scores[key]) >= score
                              ? "currentColor"
                              : "none"
                          }
                        />
                        {score}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="form-section last-section">
            <div className="section-title">
              <span>03</span>
              <div>
                <h2>ข้อเสนอแนะและแจ้งปัญหา</h2>
                <p>ไม่บังคับ — แจ้งสิ่งที่เราควรปรับปรุง</p>
              </div>
            </div>
            <label className="form-label">ข้อเสนอแนะ</label>
            <textarea
              className="form-control mb-3"
              rows="3"
              maxLength="5000"
              value={form.suggestion}
              onChange={(event) =>
                setForm({ ...form, suggestion: event.target.value })
              }
              placeholder="แจ้งสิ่งที่เราควรปรับปรุง..."
            />
            <label className="form-label">
              พบปัญหาหรือสิ่งที่ขาดเหลือหรือไม่
            </label>
            <div className="choice-row mb-3">
              {[
                [false, "ไม่มีปัญหา"],
                [true, "มีปัญหาหรือสิ่งที่ต้องการจะแจ้ง"],
              ].map(([value, label]) => (
                <label
                  className={`choice-tile ${form.has_problem === value ? "selected" : ""}`}
                  key={label}
                >
                  <input
                    type="radio"
                    name="has_problem"
                    checked={form.has_problem === value}
                    onChange={() => {
                      setForm((previous) => ({
                        ...previous,
                        has_problem: value,
                        ...(value
                          ? {}
                          : {
                              problem_description: "",
                              problem_category_ids: [],
                            }),
                      }));
                      if (!value) setImages([]);
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {form.has_problem && (
              <>
                <div
                  ref={categorySectionRef}
                  className={`${shakeField.categories ? "gform-shake" : ""} ${
                    fieldErrors.categories ? "gform-error-box" : ""
                  }`}
                >
                  <label className="form-label">
                    ประเภทปัญหา <span className="text-danger">*</span>{" "}
                    <small className="text-muted">
                      (เลือกได้มากกว่า 1 ข้อ)
                    </small>
                  </label>
                  <div className="category-list">
                    {categories.map((item) => (
                      <label
                        className="form-check category-chip"
                        key={item.category_id}
                      >
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={form.problem_category_ids.includes(
                            item.category_id,
                          )}
                          onChange={() => {
                            toggleCategory(item.category_id);
                            setFieldErrors((prev) => ({
                              ...prev,
                              categories: "",
                            }));
                          }}
                        />
                        <span className="form-check-label">
                          {item.category_name}
                        </span>
                      </label>
                    ))}
                  </div>
                  {fieldErrors.categories && (
                    <div className="gform-error-text" role="alert">
                      ! {fieldErrors.categories}
                    </div>
                  )}
                </div>

                <div
                  ref={evidenceSectionRef}
                  className={`mt-3 ${shakeField.evidence ? "gform-shake" : ""} ${
                    fieldErrors.evidence ? "gform-error-box" : ""
                  }`}
                >
                  <label className="form-label">
                    รายละเอียดเพิ่มเติม{" "}
                    <small className="text-muted">
                      (กรอกรายละเอียด หรือแนบรูปภาพอย่างใดอย่างหนึ่ง)
                    </small>
                  </label>
                  <textarea
                    className="form-control mb-3"
                    rows="3"
                    maxLength="5000"
                    value={form.problem_description}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setForm({ ...form, problem_description: nextValue });
                      if (nextValue.trim() || images.length > 0) {
                        setFieldErrors((prev) => ({ ...prev, evidence: "" }));
                      }
                    }}
                    placeholder="ระบุรายละเอียดปัญหาเพิ่มเติม..."
                  />

                  <label className="form-label">
                    แนบรูปภาพ (JPG, PNG, WEBP ไม่เกิน 3 รูป รูปละ 5 MB)
                  </label>
                  <div className="d-flex gap-2 mb-2">
                    <label
                      className={`btn btn-outline-primary flex-fill d-flex align-items-center justify-content-center gap-2 ${
                        images.length >= 3 ? "disabled" : ""
                      }`}
                      style={{
                        cursor: images.length >= 3 ? "not-allowed" : "pointer",
                      }}
                    >
                      <span>📷 ถ่ายรูป</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        disabled={images.length >= 3}
                        onChange={(event) => {
                          handleAddImages(event);
                          setFieldErrors((prev) => ({ ...prev, evidence: "" }));
                        }}
                      />
                    </label>

                    <label
                      className={`btn btn-outline-secondary flex-fill d-flex align-items-center justify-content-center gap-2 ${
                        images.length >= 3 ? "disabled" : ""
                      }`}
                      style={{
                        cursor: images.length >= 3 ? "not-allowed" : "pointer",
                      }}
                    >
                      <span>🖼️ เลือกจากคลังภาพ</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        hidden
                        disabled={images.length >= 3}
                        onChange={(event) => {
                          handleAddImages(event);
                          setFieldErrors((prev) => ({ ...prev, evidence: "" }));
                        }}
                      />
                    </label>
                  </div>

                  {images.length > 0 && (
                    <div className="mt-2">
                      <small className="text-muted d-block mb-2">
                        เลือกแล้ว {images.length} / 3 รูป
                      </small>
                      <div className="d-flex gap-2 flex-wrap">
                        {images.map((file, idx) => (
                          <div
                            key={`${file.name}-${idx}`}
                            className="position-relative border rounded overflow-hidden"
                            style={{ width: 80, height: 80 }}
                          >
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`preview-${idx}`}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center"
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: "0 0 0 6px",
                              }}
                              onClick={() => removeImage(idx)}
                              title="ลบรูปนี้"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fieldErrors.evidence && (
                    <div className="gform-error-text" role="alert">
                      ! {fieldErrors.evidence}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
          <button
            type="submit"
            className={`btn btn-primary submit-button ${buttonStatus === "loading" ? "is-loading" : ""} ${buttonStatus === "success" ? "is-success" : ""}`}
            disabled={buttonStatus !== "idle" || loading || !survey}
          >
            {buttonStatus === "loading" ? (
              <span className="submit-button-spinner" aria-label="กำลังส่ง" />
            ) : buttonStatus === "success" ? (
              <span className="submit-button-success">✓ ส่งสำเร็จ</span>
            ) : (
              "ส่งแบบประเมิน"
            )}
          </button>
          <div className="privacy-note">
            ข้อมูลของคุณจะถูกนำไปใช้เพื่อพัฒนาคุณภาพบริการเท่านั้น
          </div>
        </form>
      </div>
    </main>
  );
}

function Login() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'success'
  const [shake, setShake] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (status !== "idle") return;

    setStatus("loading");
    setError("");
    setShake(false);

    try {
      await api.post("/admin/login", credentials);
      setStatus("success");

      // หน่วงให้เห็นแอนิเมชันติ๊กถูกสีเขียวสวยๆ ก่อนเด้งเข้าหน้า Admin
      setTimeout(() => {
        navigate("/admin", { replace: true });
      }, 750);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setStatus("idle");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <main
      className="login-page"
      style={{ position: "relative", overflow: "hidden" }}
    >
      <style>{`
        /* แอนิเมชันแสงพื้นหลังลอยไปมา */
        @keyframes floatOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -50px) scale(1.12); }
          50% { transform: translate(60px, -70px) scale(1.2); }
          66% { transform: translate(-40px, 30px) scale(0.92); }
        }
        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, 40px) scale(2.0); }
          50% { transform: translate(-45px, -35px) scale(1.15); }
        }

        /* การ์ดเด้งเปิดพร้อมแรงสปริง */
        @keyframes cardPopIn {
          0% {
            opacity: 0;
            transform: translateY(40px) scale(0.92);
          }
          70% {
            opacity: 1;
            transform: translateY(-4px) scale(1.01);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* แสงวิบวับวิ่งผ่านการ์ดตอนเปิดหน้า */
        @keyframes shimmerSweep {
          0% { transform: translateX(-150%) skewX(-20deg); }
          50% { transform: translateX(0) skewX(-20deg); }
          100% { transform: translateX(250%) skewX(-20deg); }
        }

        /* แอนิเมชันโผล่ทีละชิ้น (Stagger) */
        @keyframes itemSlideUp {
          0% {
            opacity: 0;
            transform: translateY(18px);
          }
          50% {
            opacity: 0.5;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* วงแหวนรอบโลโก้เต้นเป็นจังหวะ */
        @keyframes pulseRing {
          0% { transform: scale(0.95); opacity: 0.7; }
          70% { transform: scale(1.35); opacity: 0; }
          100% { transform: scale(1.35); opacity: 0; }
        }

        /* สั่นเตือนเมื่อรหัสผิด */
        @keyframes shakeError {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }

        @keyframes spinLoader {
          to { transform: rotate(360deg); }
        }

        .login-bg-orb-1 {
          position: absolute;
          top: -80px;
          right: -60px;
          width: 340px;
          height: 340px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(13,110,253,0.18) 0%, rgba(13,110,253,0) 70%);
          filter: blur(20px);
          animation: floatOrb1 11s ease-in-out infinite;
          pointer-events: none;
        }

        .login-bg-orb-2 {
          position: absolute;
          bottom: -100px;
          left: -80px;
          width: 380px;
          height: 380px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(25,135,84,0.15) 0%, rgba(25,135,84,0) 70%);
          filter: blur(24px);
          animation: floatOrb2 14s ease-in-out infinite;
          pointer-events: none;
        }

        .login-card-deluxe {
          position: relative;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.92) !important;
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
          animation: cardPopIn 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .login-card-deluxe::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 50%;
          height: 100%;
          background: linear-gradient(
            to right,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.65) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          animation: shimmerSweep 1.2s ease-out 0.3s forwards;
          pointer-events: none;
        }

        .login-card-shake {
          animation: shakeError 0.45s ease-in-out !important;
        }

        .stagger-1 { opacity: 0; animation: itemSlideUp 0.5s ease-out 0.12s forwards; }
        .stagger-2 { opacity: 0; animation: itemSlideUp 0.5s ease-out 0.22s forwards; }
        .stagger-3 { opacity: 0; animation: itemSlideUp 0.5s ease-out 0.32s forwards; }
        .stagger-4 { opacity: 0; animation: itemSlideUp 0.5s ease-out 0.42s forwards; }
        .stagger-5 { opacity: 0; animation: itemSlideUp 0.5s ease-out 0.52s forwards; }

        .logo-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }
        .logo-wrapper::after {
          content: "";
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid rgba(13, 110, 253, 0.35);
          animation: pulseRing 2.5s cubic-bezier(0.24, 0, 0.38, 1) infinite;
        }

        .input-icon-group {
          position: relative;
        }
        .input-icon-left {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #6c757d;
          transition: color 0.2s ease, transform 0.2s ease;
          pointer-events: none;
        }
        .input-icon-group:focus-within .input-icon-left {
          color: #0d6efd;
          transform: translateY(-50%) scale(1.1);
        }
        .input-with-icon {
          padding-left: 40px !important;
          transition: all 0.25s ease;
        }
        .input-with-icon:focus {
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(13, 110, 253, 0.14) !important;
        }

        .eye-toggle-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: #6c757d;
          padding: 4px;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: color 0.2s ease, transform 0.15s ease;
        }
        .eye-toggle-btn:hover {
          color: #0d6efd;
          transform: translateY(-50%) scale(1.12);
        }
      `}</style>

      {/* วงแสงพื้นหลังเคลื่อนไหว */}
      <div className="login-bg-orb-1" />
      <div className="login-bg-orb-2" />

      <Link to="/" className="back-link stagger-1" style={{ zIndex: 2 }}>
        ← กลับหน้าประเมิน
      </Link>

      <form
        className={`login-card login-card-deluxe ${shake ? "login-card-shake" : ""}`}
        onSubmit={submit}
        style={{ zIndex: 2 }}
      >
        <div className="stagger-1">
          <div className="logo-wrapper">
            <img
              className="hospital-logo"
              src="/hospital-logo.jpg"
              alt="โลโก้โรงพยาบาลร้อยเอ็ด"
              width="44"
              height="44"
              style={{ margin: 0 }}
            />
          </div>
          <div className="eyebrow">ADMINISTRATOR</div>
          <h1>เข้าสู่ระบบ</h1>
          <p>ระบบจัดการประเมินห้องพิเศษ</p>
        </div>

        <Alert error={error} />

        <div className="stagger-2 mb-3">
          <label className="form-label">ชื่อผู้ใช้</label>
          <div className="input-icon-group">
            <User size={17} className="input-icon-left" />
            <input
              className="form-control input-with-icon"
              autoComplete="username"
              placeholder="กรอกชื่อผู้ใช้"
              value={credentials.username}
              onChange={(event) =>
                setCredentials({ ...credentials, username: event.target.value })
              }
              required
            />
          </div>
        </div>

        <div className="stagger-3 mb-4">
          <label className="form-label">รหัสผ่าน</label>
          <div className="input-icon-group">
            <Lock size={17} className="input-icon-left" />
            <input
              className="form-control input-with-icon"
              style={{ paddingRight: "40px" }}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="กรอกรหัสผ่าน"
              value={credentials.password}
              onChange={(event) =>
                setCredentials({ ...credentials, password: event.target.value })
              }
              required
            />
            <button
              type="button"
              className="eye-toggle-btn"
              onClick={() => setShowPassword((prev) => !prev)}
              title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div className="stagger-4">
          <button
            type="submit"
            disabled={status !== "idle"}
            style={{
              width: status === "loading" ? "46px" : "100%",
              height: "46px",
              backgroundColor: status === "success" ? "#198754" : "#0d6efd",
              color: "#fff",
              border: "none",
              borderRadius: status === "loading" ? "50%" : "8px",
              fontWeight: 600,
              cursor: status === "idle" ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              margin: "0 auto",
              transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
              boxShadow:
                status === "idle"
                  ? "0 6px 18px rgba(13, 110, 253, 0.25)"
                  : "none",
            }}
          >
            {status === "idle" && <span>เข้าสู่ระบบ</span>}

            {status === "loading" && (
              <span
                style={{
                  width: "20px",
                  height: "20px",
                  border: "2.5px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spinLoader 0.6s linear infinite",
                }}
              />
            )}

            {status === "success" && (
              <>
                <Check size={20} />
                <span>เข้าสู่ระบบสำเร็จ!</span>
              </>
            )}
          </button>
        </div>
      </form>
    </main>
  );
}

function AdminLayout({ children }) {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api
      .get("/admin/me")
      .then((response) => setAdmin(response.data.admin))
      .catch(() => navigate("/admin/login", { replace: true }))
      .finally(() => setReady(true));
  }, [navigate]);
  async function logout() {
    try {
      await api.post("/admin/logout");
      navigate("/admin/login", { replace: true });
    } catch (error) {
      Swal.fire("ออกจากระบบไม่สำเร็จ", getErrorMessage(error), "error");
    }
  }
  if (!ready || !admin)
    return <div className="loading-screen">กำลังตรวจสอบสิทธิ์...</div>;
  const nav = [
    ["/admin", BarChart3, "ภาพรวม"],
    ["/admin/evaluations", ClipboardList, "ผลการประเมิน"],
    ["/admin/reports", TriangleAlert, "รายการแจ้งปัญหา"],
    ["/admin/qr-codes", QrCode, "QR Code อาคาร/เตียง"],
  ];
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link to="/admin" className="sidebar-brand">
          <img
            className="hospital-logo"
            src="/hospital-logo.jpg"
            alt="โลโก้โรงพยาบาลร้อยเอ็ด"
            width="38"
            height="38"
          />
          <span>
            ห้องพิเศษ<small>ADMIN CONSOLE</small>
          </span>
        </Link>
        <div className="sidebar-label">เมนูหลัก</div>
        {nav.map(([to, Icon, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/admin"}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        <div className="sidebar-bottom">
          <div className="admin-avatar">
            {admin.username.slice(0, 1).toUpperCase()}
          </div>
          <div className="admin-name">
            {admin.username}
            <small>ผู้ดูแลระบบ</small>
          </div>
          <button
            type="button"
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
            className="logout-btn"
            onClick={logout}
          >
            <LogOut size={18} className="logout-btn-icon" aria-hidden="true" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

function QrManagement() {
  const [wards, setWards] = useState([]);
  const [codes, setCodes] = useState([]);
  const [problemCategories, setProblemCategories] = useState([]);
  const [form, setForm] = useState({
    qr_code_id: null,
    building_name: "",
    ward_ids: [],
    selected_ward_id: "",
    selected_bed_ids: [],
    include_unassigned: false,
    is_active: 1,
  });
  const [previewCodes, setPreviewCodes] = useState([]);
  const [showCreatedPreview, setShowCreatedPreview] = useState(false);
  const [printJob, setPrintJob] = useState(null);
  const [surveyPrintJob, setSurveyPrintJob] = useState(null);
  const [selectedQrIdsByWard, setSelectedQrIdsByWard] = useState({});
  const [openQrPickerByWard, setOpenQrPickerByWard] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingWard, setEditingWard] = useState(null);
  const qrPreviewRef = useRef(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false,
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [openWardPicker, setOpenWardPicker] = useState(false);
  useEffect(() => {
    function handleOutsidePointerDown(event) {
      // ตรวจจาก composedPath เพื่อรองรับการคลิก input, label และเนื้อหาภายใน dropdown
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];
      const clickedInsidePicker = path.some(
        (node) =>
          node instanceof Element &&
          (node.matches(".qr-picker-container, .ward-picker-container") ||
            node.closest(".qr-picker-container, .ward-picker-container")),
      );

      if (clickedInsidePicker) return;

      setOpenQrPickerByWard({});
      setOpenWardPicker(false);
    }

    function handlePickerKeyDown(event) {
      if (event.key === "Escape") {
        setOpenQrPickerByWard({});
        setOpenWardPicker(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handlePickerKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handlePickerKeyDown);
    };
  }, []);

  async function load() {
    try {
      const [wardResponse, codeResponse, categoryResponse] = await Promise.all([
        api.get("/admin/wards"),
        api.get("/admin/qr-codes"),
        api.get("/problem-categories"),
      ]);
      setWards(wardResponse.data);
      setCodes(codeResponse.data);
      setProblemCategories(categoryResponse.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }
  const selectedWardId =
    form.selected_ward_id ||
    (form.ward_ids.length === 1 ? String(form.ward_ids[0]) : "");
  const selectedWard = wards.find(
    (ward) => String(ward.ward_id) === String(selectedWardId),
  );
  const selectedWardCodes = codes.filter((code) =>
    code.ward_ids.some((id) => String(id) === String(selectedWardId)),
  );
  const assignedBedIds = new Set(
    selectedWardCodes
      .filter(
        (code) =>
          String(code.qr_code_id) !== String(form.qr_code_id) &&
          code.bed_id !== null,
      )
      .map((code) => String(code.bed_id)),
  );
  const availableBeds = (selectedWard?.beds || []).filter(
    (bed) => Number(bed.is_active) && !assignedBedIds.has(String(bed.bed_id)),
  );

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (previewCodes.length)
      qrPreviewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  }, [previewCodes]);
  function chooseWard(wardId) {
    setPreviewCodes([]);
    setNotice("");
    setForm((previous) => ({
      ...previous,
      selected_ward_id: wardId,
      selected_bed_ids: [],
      include_unassigned: false,
    }));
  }

  function toggleBed(bedId, checked) {
    const id = String(bedId);
    setForm((previous) => ({
      ...previous,
      selected_bed_ids: checked
        ? [...new Set([...previous.selected_bed_ids.map(String), id])]
        : previous.selected_bed_ids.filter(
            (selectedId) => String(selectedId) !== id,
          ),
    }));
    setPreviewCodes([]);
  }
  function toggleAllAvailableBeds() {
    const availableIds = availableBeds.map((bed) => String(bed.bed_id));
    const selectedIds = form.selected_bed_ids.map(String);
    const allSelected =
      availableIds.length > 0 &&
      availableIds.every((id) => selectedIds.includes(id));

    setForm((previous) => ({
      ...previous,
      selected_bed_ids: allSelected
        ? previous.selected_bed_ids.filter(
            (id) => !availableIds.includes(String(id)),
          )
        : [
            ...new Set([
              ...previous.selected_bed_ids.map(String),
              ...availableIds,
            ]),
          ],
    }));
    setPreviewCodes([]);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const wardIds = selectedWardId ? [Number(selectedWardId)] : [];
      if (!wardIds.length) throw new Error("กรุณาเลือก Ward");
      const availableBedIdSet = new Set(
        availableBeds.map((bed) => String(bed.bed_id)),
      );
      const bedIds = form.selected_bed_ids
        .map(Number)
        .filter((id) => availableBedIdSet.has(String(id)));
      if (!bedIds.length && !form.include_unassigned) {
        throw new Error(
          "กรุณาเลือกเตียงอย่างน้อย 1 เตียง หรือเลือกไม่ผูกเตียง",
        );
      }
      const payload = {
        building_name: form.building_name,
        ward_ids: wardIds,
        bed_ids: bedIds,
        include_unassigned: Boolean(form.include_unassigned),
        is_active: form.is_active,
      };
      const response = await api.post("/admin/qr-codes", payload);
      const createdCodes = response.data.qr_codes || [response.data];
      setPreviewCodes(createdCodes);
      setShowCreatedPreview(false);
      setNotice(`สร้าง QR Code แล้ว ${createdCodes.length} รายการ`);
      setForm({
        qr_code_id: null,
        building_name: "",
        ward_ids: [],
        selected_ward_id: "",
        selected_bed_ids: [],
        include_unassigned: false,
        is_active: 1,
      });
      await load();
    } catch (requestError) {
      setError(
        requestError.response
          ? getErrorMessage(requestError)
          : requestError.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveWardStatus() {
    if (!editingWard) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.put(`/admin/wards/${editingWard.ward_id}/status`, {
        is_active: editingWard.is_active,
      });
      setEditingWard(null);
      setNotice("บันทึกสถานะ Ward แล้ว");
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function printCodes(printCodes) {
    setBusy(true);
    setError("");
    try {
      const pdfjsLib = await getPdfJs();
      const pdf = await pdfjsLib.getDocument("/templates/qr-ward-template.pdf")
        .promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 4 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("ไม่สามารถเตรียมภาพเทมเพลตสำหรับพิมพ์ได้");
      await page.render({ canvasContext: context, viewport }).promise;
      setPrintJob({
        templateImage: canvas.toDataURL("image/png"),
        codes: printCodes,
      });
    } catch (printError) {
      setError(printError.message || "ไม่สามารถสร้างเอกสารสำหรับพิมพ์ได้");
    } finally {
      setBusy(false);
    }
  }

  function printSurveyForms(targetCodes) {
    setSurveyPrintJob({ codes: targetCodes });
  }

  async function deleteCode(code, { silent = false } = {}) {
    const bedLabel = code.bed_name || "ไม่ผูกเตียง · เลือกเตียงเอง";
    const label = code.building_name
      ? `${code.building_name} · ${bedLabel}`
      : `${bedLabel} (QR Code #${code.qr_code_id})`;

    if (!silent) {
      const confirmation = await Swal.fire({
        title: "ยืนยันการลบ QR Code?",
        text: `QR Code สำหรับ ${label} จะถูกลบ และ Ward จะสามารถกำหนด QR Code ใหม่ได้`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "ลบ QR Code",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#dc3545",
        customClass: {
          popup: "qr-delete-popup",
        },
      });
      if (!confirmation.isConfirmed) {
        return { ok: false, cancelled: true, code, label, reason: "" };
      }
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api.delete(`/admin/qr-codes/${code.qr_code_id}`);

      setPreviewCodes((previous) => {
        const next = previous.filter(
          (preview) => preview.qr_code_id !== code.qr_code_id,
        );
        if (!next.length) setShowCreatedPreview(false);
        return next;
      });

      if (!silent) {
        await Swal.fire({
          title: "ลบสำเร็จ",
          text: `ลบ QR Code สำหรับ ${label} เรียบร้อยแล้ว`,
          icon: "success",
          confirmButtonText: "ตกลง",
        });
        await load();
      }

      return { ok: true, code, label };
    } catch (requestError) {
      const errorMessage = getErrorMessage(requestError);

      if (!silent) {
        setError(errorMessage);
        await Swal.fire({
          title: "ลบไม่สำเร็จ",
          text: errorMessage,
          icon: "error",
          confirmButtonText: "ตกลง",
        });
        await load();
      }

      return { ok: false, code, label, reason: errorMessage };
    } finally {
      if (!silent) {
        setBusy(false);
      }
    }
  }

  async function deleteSelectedCodes(targetCodes, wardId) {
    if (!targetCodes.length) return;
    if (targetCodes.length === 1) {
      return deleteCode(targetCodes[0]);
    }

    const confirmation = await Swal.fire({
      title: `ยืนยันการลบ QR Code ทั้ง ${targetCodes.length} รายการ?`,
      text: "QR Code ที่เลือกทั้งหมดจะถูกลบ และเตียงเหล่านี้จะสามารถสร้าง QR Code ใหม่ได้",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: `ลบทั้งหมด (${targetCodes.length})`,
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc3545",
      customClass: {
        popup: "qr-delete-popup",
      },
    });
    if (!confirmation.isConfirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    const succeeded = [];
    const failed = [];

    try {
      for (const code of targetCodes) {
        const result = await deleteCode(code, { silent: true });
        if (result.ok) {
          succeeded.push(result);
        } else {
          failed.push(result);
        }
      }

      if (failed.length > 0) {
        const failedItemsHtml = failed
          .map(
            (item) => `
              <li style="text-align: left; margin-bottom: 8px;">
                <strong>${escapeHtml(item.label)}</strong><br/>
                <span style="color: #dc3545;">สาเหตุ: ${escapeHtml(item.reason)}</span>
              </li>
            `,
          )
          .join("");

        const summaryHtml =
          succeeded.length > 0
            ? `<p style="margin-bottom: 10px;">ลบสำเร็จ <strong>${succeeded.length}</strong> รายการ / ไม่สำเร็จ <strong>${failed.length}</strong> รายการ:</p>`
            : `<p style="margin-bottom: 10px;">ไม่สามารถลบ QR Code ได้ <strong>${failed.length}</strong> รายการ:</p>`;

        setError(
          failed.map((item) => `${item.label}: ${item.reason}`).join(" | "),
        );

        await Swal.fire({
          title:
            succeeded.length > 0
              ? "ลบสำเร็จบางรายการ"
              : "ไม่สามารถลบ QR Code ได้",
          html: `${summaryHtml}<ul style="padding-left: 18px; margin: 0;">${failedItemsHtml}</ul>`,
          icon: succeeded.length > 0 ? "warning" : "error",
          confirmButtonText: "ตกลง",
          allowOutsideClick: false,
        });
      } else {
        setNotice(`ลบ QR Code เรียบร้อยแล้ว ${succeeded.length} รายการ`);
        await Swal.fire({
          title: "ลบสำเร็จ",
          text: `ลบ QR Code เรียบร้อยแล้ว ${succeeded.length} รายการ`,
          icon: "success",
          confirmButtonText: "ตกลง",
        });
      }

      if (wardId) {
        setSelectedQrIdsByWard((previous) => ({ ...previous, [wardId]: [] }));
        setOpenQrPickerByWard((previous) => ({ ...previous, [wardId]: false }));
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const wardGroups = wards.map((ward) => {
    const wardCodes = codes.filter((code) =>
      code.ward_ids.some((id) => String(id) === String(ward.ward_id)),
    );
    const selectedCode = wardCodes[0];
    return { ward, codes: wardCodes, selectedCode };
  });

  const unassignedWards = wards.filter(
    (ward) =>
      Number(ward.is_active) &&
      !codes.some((code) =>
        code.ward_ids.some((id) => String(id) === String(ward.ward_id)),
      ),
  );

  const completedWardIds = new Set(
    wards
      .filter((ward) => {
        const wardCodes = codes.filter((code) =>
          code.ward_ids.some((id) => String(id) === String(ward.ward_id)),
        );
        const activeBedIds = ward.beds
          .filter((bed) => Number(bed.is_active))
          .map((bed) => String(bed.bed_id));
        return (
          activeBedIds.length > 0 &&
          activeBedIds.every((bedId) =>
            wardCodes.some((code) => String(code.bed_id) === bedId),
          )
        );
      })
      .map((ward) => String(ward.ward_id)),
  );

  function getSelectedCodesForWard(wardId, wardCodes, fallbackCode) {
    const selectedIds = selectedQrIdsByWard[wardId];
    if (selectedIds === undefined) return fallbackCode ? [fallbackCode] : [];
    return wardCodes.filter((code) =>
      selectedIds.includes(String(code.qr_code_id)),
    );
  }

  function toggleWardQrCode(wardId, codeId, checked, fallbackCode) {
    const id = String(codeId);
    setSelectedQrIdsByWard((previous) => {
      const current =
        previous[wardId] ??
        (fallbackCode ? [String(fallbackCode.qr_code_id)] : []);
      return {
        ...previous,
        [wardId]: checked
          ? [...new Set([...current, id])]
          : current.filter((selectedId) => selectedId !== id),
      };
    });
    setPreviewCodes([]);
    setNotice("");
  }

  function toggleAllWardQrCodes(wardId, wardCodes, fallbackCode) {
    const current = getSelectedCodesForWard(wardId, wardCodes, fallbackCode);
    const allSelected =
      wardCodes.length > 0 && current.length === wardCodes.length;
    setSelectedQrIdsByWard((previous) => ({
      ...previous,
      [wardId]: allSelected
        ? []
        : wardCodes.map((code) => String(code.qr_code_id)),
    }));
    setPreviewCodes([]);
    setNotice("");
  }

  function downloadQrCode(event, buildingName) {
    const svg = event.currentTarget
      .closest(".qr-preview-card")
      ?.querySelector("svg");
    if (!svg) {
      setError("ไม่พบ QR Code สำหรับดาวน์โหลด");
      return;
    }
    const fileName = (buildingName || "qr-code")
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, "-");
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .ward-qr-card { min-width: 0; }
          .ward-qr-header {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr);
            align-items: start !important;
            justify-content: stretch !important;
            gap: 10px !important;
          }
          .ward-qr-title { width: 100%; min-width: 0; overflow-wrap: anywhere; line-height: 1.5; }
          .ward-qr-title b { overflow-wrap: anywhere; }
          .ward-qr-title .status { display: inline-block; margin-top: 3px; white-space: nowrap; }
          .ward-qr-actions {
            width: 100%; min-width: 0; display: flex; flex-wrap: nowrap; align-items: center; gap: 6px !important;
          }
          .ward-qr-actions select {
            flex: 1 1 0%; width: auto !important; min-width: 0 !important; padding-left: 10px; padding-right: 28px; font-size: 14px;
          }
          .ward-qr-actions .btn { flex: 0 0 auto; width: auto; white-space: nowrap; padding-left: 10px; padding-right: 10px; font-size: 13px; }
          .ward-qr-edit-button { flex: 0 0 auto; width: auto; }
          .ward-qr-content { width: 100%; min-width: 0; margin-top: 14px !important; }
          .ward-qr-content .qr-picker-container,
          .ward-qr-content .qr-picker-container > button { width: 100%; min-width: 0; }
          .ward-qr-content .qr-picker-container > button { text-align: left; overflow-wrap: anywhere; }
          .ward-qr-print-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px !important; }
          .ward-qr-print-actions .status { flex: 0 0 auto; }
          .ward-qr-print-actions .btn { flex: 1 1 auto; min-width: max-content; }
        }
      `}</style>
      <PageHeader
        eyebrow="WARD & BED QR CODES"
        title="จัดการ QR Code อาคารและเตียง"
        description="เลือก Ward แล้วกำหนด QR สำหรับทุกเตียง เตียงเดียว หรือให้ผู้ประเมินเลือกเตียงเอง"
      />
      <Alert error={error} />
      {unassignedWards.length > 0 && (
        <div className="alert alert-warning">
          Ward ที่ยังไม่ได้กำหนด QR Code:{" "}
          {unassignedWards
            .map((ward) => `${ward.ward_code} ${ward.ward_name}`)
            .join("、")}
        </div>
      )}
      <section className="content-card mb-3">
        <h2>เพิ่ม QR Code</h2>
        <form className="mt-3" onSubmit={save}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Ward</label>
              <div className="position-relative ward-picker-container">
                <button
                  type="button"
                  className="form-select text-start"
                  aria-expanded={openWardPicker}
                  onClick={() => setOpenWardPicker((prev) => !prev)}
                  style={{
                    minHeight: 42,
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                  }}
                >
                  {selectedWard
                    ? `${selectedWard.ward_code} · ${selectedWard.ward_name}`
                    : "เลือก Ward"}
                </button>

                {openWardPicker && (
                  <div
                    className="dropdown-menu show w-100 p-1 shadow-sm"
                    role="listbox"
                    style={{
                      maxHeight: 240,
                      overflowY: "auto",
                      WebkitOverflowScrolling: "touch",
                      zIndex: 25,
                    }}
                  >
                    <button
                      type="button"
                      className={`dropdown-item rounded py-2 ${
                        !selectedWardId ? "active" : ""
                      }`}
                      onClick={() => {
                        chooseWard("");
                        setOpenWardPicker(false);
                      }}
                    >
                      เลือก Ward
                    </button>

                    {wards.map((ward) => {
                      const isCompleted = completedWardIds.has(
                        String(ward.ward_id),
                      );
                      const isDisabled = !Number(ward.is_active) || isCompleted;
                      const isSelected =
                        String(ward.ward_id) === String(selectedWardId);

                      return (
                        <button
                          type="button"
                          key={ward.ward_id}
                          disabled={isDisabled}
                          className={`dropdown-item rounded py-2 text-start ${
                            isSelected ? "active" : ""
                          } ${isDisabled ? "text-muted opacity-75" : ""}`}
                          style={{
                            whiteSpace: "normal",
                            overflowWrap: "anywhere",
                            cursor: isDisabled ? "not-allowed" : "pointer",
                          }}
                          onClick={() => {
                            if (isDisabled) return;
                            chooseWard(String(ward.ward_id));
                            setOpenWardPicker(false);
                          }}
                        >
                          {ward.ward_code} · {ward.ward_name}
                          {isCompleted
                            ? " · สร้าง QR ครบแล้ว"
                            : Number(ward.is_active)
                              ? ""
                              : " · ปิดใช้งาน"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="col-12">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                <label className="form-label mb-0">
                  เลือกเตียง (เลือกได้หลายเตียง)
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  disabled={!selectedWard || !availableBeds.length}
                  onClick={toggleAllAvailableBeds}
                >
                  {availableBeds.length > 0 &&
                  availableBeds.every((bed) =>
                    form.selected_bed_ids
                      .map(String)
                      .includes(String(bed.bed_id)),
                  )
                    ? "ยกเลิกเลือกทั้งหมด"
                    : "เลือกทั้งหมด"}
                </button>
              </div>
              <label className="form-check border rounded p-2 ps-5 mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={Boolean(form.include_unassigned)}
                  disabled={!selectedWard}
                  onChange={(event) => {
                    setForm((previous) => ({
                      ...previous,
                      include_unassigned: event.target.checked,
                    }));
                    setPreviewCodes([]);
                  }}
                />
                <span className="form-check-label">
                  ไม่ผูกเตียง · ให้ผู้ประเมินเลือกเอง
                </span>
              </label>

              <div className="row g-2">
                {selectedWard?.beds
                  .filter((bed) => Number(bed.is_active))
                  .map((bed) => {
                    const alreadyHasQr = assignedBedIds.has(String(bed.bed_id));
                    const checked = form.selected_bed_ids
                      .map(String)
                      .includes(String(bed.bed_id));
                    return (
                      <div className="col-sm-6 col-lg-4" key={bed.bed_id}>
                        <label
                          className={`form-check border rounded p-2 ps-5 h-100 ${alreadyHasQr ? "bg-light text-muted" : ""}`}
                        >
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={alreadyHasQr ? false : checked}
                            disabled={alreadyHasQr || !selectedWard}
                            onChange={(event) =>
                              toggleBed(bed.bed_id, event.target.checked)
                            }
                          />
                          <span className="form-check-label">
                            {bed.bed_name}
                            {alreadyHasQr && (
                              <span className="badge bg-secondary ms-2">
                                มี QR แล้ว
                              </span>
                            )}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                {selectedWard &&
                  !selectedWard.beds.some((bed) => Number(bed.is_active)) && (
                    <div className="col-12 text-muted">
                      Ward นี้ยังไม่มีเตียงที่เปิดใช้งาน
                    </div>
                  )}
              </div>
              <small className="text-muted d-block mt-2">
                เลือกเตียงได้หลายรายการพร้อมกัน และเลือก “ไม่ผูกเตียง”
                ควบคู่กันได้
                {` · เตียงที่มี QR แล้ว ${assignedBedIds.size} เตียงจะถูกล็อกไม่ให้เลือกซ้ำ`}
              </small>
            </div>
            <div className="col-md-6 d-flex align-items-end">
              <label className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={Boolean(form.is_active)}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      is_active: event.target.checked ? 1 : 0,
                    }))
                  }
                />
                <span className="form-check-label">เปิดใช้งาน QR Code</span>
              </label>
            </div>
            {selectedWard && (
              <div className="col-12 text-muted">
                {selectedWard.active_bed_count} เตียงที่เปิดใช้งานใน Ward นี้
              </div>
            )}
          </div>
          <div className="d-flex gap-2 mt-3">
            <button
              className="btn btn-primary"
              disabled={busy || !selectedWardId}
            >
              {busy ? "กำลังดำเนินการ..." : "สร้าง QR Code"}
            </button>
          </div>
        </form>
      </section>
      {(notice || previewCodes.length > 0) && (
        <div className="my-3">
          {notice && (
            <div
              className="alert alert-success d-flex align-items-center justify-content-between flex-wrap gap-2 mb-0"
              role="status"
            >
              <span>{notice}</span>
              {previewCodes.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  onClick={() => setShowCreatedPreview((prev) => !prev)}
                >
                  {showCreatedPreview
                    ? "ซ่อนตัวอย่าง QR Code"
                    : "แสดงตัวอย่าง QR Code"}
                </button>
              )}
            </div>
          )}

          {showCreatedPreview &&
            previewCodes.map((code, index) => {
              const surveyUrl = `${window.location.origin}/?qr=${encodeURIComponent(code.qr_token)}`;
              return (
                <section
                  ref={index === 0 ? qrPreviewRef : undefined}
                  key={code.qr_code_id}
                  className="content-card qr-preview-card my-3 d-flex align-items-center gap-4 flex-wrap"
                  style={{ maxWidth: "100%", overflow: "hidden" }}
                >
                  <QRCodeSVG
                    value={surveyUrl}
                    size={isMobile ? 136 : 160}
                    style={{ flexShrink: 0, maxWidth: "100%", height: "auto" }}
                  />
                  <div
                    style={{ flex: "1 1 220px", minWidth: 0, maxWidth: "100%" }}
                  >
                    <h2 style={{ overflowWrap: "anywhere" }}>
                      QR Code สำหรับ {code.building_name}
                    </h2>
                    <p className="mb-2" style={{ overflowWrap: "anywhere" }}>
                      {code.bed_name || "ไม่ผูกเตียง · ผู้ประเมินเลือกเตียงเอง"}
                    </p>
                    <p className="mb-2">
                      สแกน QR Code หรือเปิดลิงก์ด้านล่างเพื่อตรวจสอบได้
                    </p>
                    <a
                      href={surveyUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "block",
                        maxWidth: "100%",
                        overflowWrap: "anywhere",
                        wordBreak: "break-all",
                        fontSize: isMobile ? "0.875rem" : "1rem",
                      }}
                    >
                      {surveyUrl}
                    </a>
                    <div className="mt-3 d-flex gap-2 flex-wrap">
                      <button
                        type="button"
                        className="btn btn-outline-primary d-inline-flex align-items-center gap-2"
                        onClick={(event) =>
                          downloadQrCode(event, code.building_name)
                        }
                      >
                        <Download size={16} />
                        ดาวน์โหลด QR Code
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => printCodes([code])}
                      >
                        พิมพ์ QR Code
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-success"
                        disabled={busy}
                        onClick={() => printSurveyForms([code])}
                      >
                        พิมพ์แบบประเมิน (A4)
                      </button>
                    </div>
                  </div>
                </section>
              );
            })}
        </div>
      )}
      <section className="content-card">
        <h2>QR Code แยกตาม Ward</h2>
        <div className="row g-3 mt-1">
          {wardGroups.map(({ ward, codes: wardCodes, selectedCode }) => (
            <div className="col-xl-6" key={ward.ward_id}>
              <div className="border rounded p-3 h-100 ward-qr-card">
                <div className="d-flex align-items-center justify-content-between gap-2 ward-qr-header">
                  <div className="ward-qr-title">
                    <b>
                      {ward.ward_code} · {ward.ward_name}
                    </b>
                    <span
                      className={`status ms-2 ${Number(ward.is_active) ? "status-ok" : "status-muted"}`}
                    >
                      {Number(ward.is_active) ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </div>
                  {editingWard?.ward_id === ward.ward_id ? (
                    <div className="d-flex align-items-center gap-2 ward-qr-actions">
                      <select
                        className="form-select form-select-sm"
                        aria-label="สถานะ Ward"
                        value={editingWard.is_active}
                        style={{
                          width: "115px",
                          minWidth: "115px",
                          flexShrink: 0,
                          paddingRight: "25px",
                          backgroundPosition: "right 10px center",
                        }}
                        onChange={(event) =>
                          setEditingWard({
                            ...editingWard,
                            is_active: Number(event.target.value),
                          })
                        }
                      >
                        <option value={1}>เปิดใช้งาน</option>
                        <option value={0}>ปิดใช้งาน</option>
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={saveWardStatus}
                      >
                        บันทึก
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={busy}
                        onClick={() => setEditingWard(null)}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary ward-qr-edit-button"
                      disabled={busy}
                      onClick={() =>
                        setEditingWard({
                          ward_id: ward.ward_id,
                          is_active: Number(ward.is_active),
                        })
                      }
                    >
                      แก้ไข
                    </button>
                  )}
                </div>
                <div className="mt-2 ward-qr-content">
                  <label className="form-label">เลือก QR Code / เตียง</label>
                  {(() => {
                    const selectedCodes = getSelectedCodesForWard(
                      ward.ward_id,
                      wardCodes,
                      selectedCode,
                    );
                    const selectedIds = selectedCodes.map((code) =>
                      String(code.qr_code_id),
                    );
                    const allSelected =
                      wardCodes.length > 0 &&
                      selectedCodes.length === wardCodes.length;
                    const selectedLabel = selectedCodes
                      .map(
                        (code) =>
                          code.bed_name || "ไม่ผูกเตียง · เลือกเตียงเอง",
                      )
                      .join(", ");

                    return (
                      <>
                        <div
                          className="position-relative qr-picker-container"
                          onPointerDown={(event) => event.stopPropagation()}
                          style={{
                            zIndex: openQrPickerByWard[ward.ward_id]
                              ? 1056
                              : "auto",
                          }}
                        >
                          <button
                            type="button"
                            className="form-select text-start"
                            disabled={!wardCodes.length}
                            aria-expanded={Boolean(
                              openQrPickerByWard[ward.ward_id],
                            )}
                            onClick={() =>
                              setOpenQrPickerByWard((previous) => ({
                                ...previous,
                                [ward.ward_id]: !previous[ward.ward_id],
                              }))
                            }
                            style={{
                              minHeight: 48,
                              whiteSpace: "normal",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {selectedCodes.length
                              ? `${selectedCodes.length} รายการ: ${selectedLabel}`
                              : "เลือก QR Code / เตียง"}
                          </button>

                          {openQrPickerByWard[ward.ward_id] &&
                            wardCodes.length > 0 && (
                              <div
                                className="dropdown-menu show w-100 p-3 shadow-sm"
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                                style={{
                                  maxHeight: 280,
                                  overflowY: "auto",
                                  zIndex: 1057,
                                  pointerEvents: "auto",
                                }}
                              >
                                <label
                                  className="d-flex align-items-center gap-2 pb-2 mb-2 border-bottom"
                                  style={{ cursor: "pointer" }}
                                >
                                  <input
                                    className="form-check-input m-0 flex-shrink-0"
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={() =>
                                      toggleAllWardQrCodes(
                                        ward.ward_id,
                                        wardCodes,
                                        selectedCode,
                                      )
                                    }
                                  />
                                  <span className="fw-semibold">
                                    All · เลือกทั้งหมด ({wardCodes.length})
                                  </span>
                                </label>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isMobile
                                      ? "repeat(2, minmax(0, 1fr))"
                                      : "repeat(3, minmax(0, 1fr))",
                                    gap: "8px 12px",
                                  }}
                                >
                                  {wardCodes.map((code) => {
                                    const codeId = String(code.qr_code_id);
                                    return (
                                      <label
                                        key={code.qr_code_id}
                                        className="d-flex align-items-center gap-2 py-1 px-1 rounded"
                                        style={{ cursor: "pointer" }}
                                      >
                                        <input
                                          className="form-check-input m-0 flex-shrink-0"
                                          type="checkbox"
                                          checked={selectedIds.includes(codeId)}
                                          onChange={(event) =>
                                            toggleWardQrCode(
                                              ward.ward_id,
                                              code.qr_code_id,
                                              event.target.checked,
                                              selectedCode,
                                            )
                                          }
                                        />
                                        <span
                                          style={{
                                            whiteSpace: "normal",
                                            overflowWrap: "anywhere",
                                            lineHeight: 1.35,
                                            fontSize: isMobile ? 13 : 14,
                                          }}
                                        >
                                          {code.bed_name ||
                                            "ไม่ผูกเตียง · เลือกเตียงเอง"}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                        </div>

                        {wardCodes.length > 0 && (
                          <div className="d-flex gap-2 flex-wrap align-items-center mt-3 ward-qr-print-actions">
                            <span className="status status-muted">
                              เลือกแล้ว {selectedCodes.length} /{" "}
                              {wardCodes.length} รายการ
                            </span>
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              disabled={busy || !selectedCodes.length}
                              onClick={() => printSurveyForms(selectedCodes)}
                            >
                              พิมพ์แบบประเมิน
                              {selectedCodes.length
                                ? ` (${selectedCodes.length})`
                                : ""}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={busy || !selectedCodes.length}
                              onClick={() => printCodes(selectedCodes)}
                            >
                              พิมพ์ QR Code
                              {selectedCodes.length
                                ? ` (${selectedCodes.length})`
                                : ""}
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={busy || !selectedCodes.length}
                              onClick={() =>
                                deleteSelectedCodes(selectedCodes, ward.ward_id)
                              }
                            >
                              ลบ
                              {selectedCodes.length > 1
                                ? ` (${selectedCodes.length})`
                                : ""}
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
          {!wards.length && (
            <div className="col-12">
              <div className="empty-state">ยังไม่มี Ward ให้นำเข้าและกำหนด</div>
            </div>
          )}
        </div>
        {previewCodes.length > 1 && (
          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={busy}
            onClick={() => printCodes(previewCodes)}
          >
            พิมพ์ QR Code ทั้ง {previewCodes.length} รายการ
          </button>
        )}
      </section>
      {printJob && (
        <div
          className="qr-print-preview"
          role="dialog"
          aria-modal="true"
          aria-label="ตัวอย่างก่อนพิมพ์"
        >
          <div className="qr-print-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.print()}
            >
              สั่งพิมพ์
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setPrintJob(null)}
            >
              ปิดตัวอย่าง
            </button>
          </div>
          <div className="qr-print-pages">
            {printJob.codes.map((code) => {
              const surveyUrl = `${window.location.origin}/?qr=${encodeURIComponent(code.qr_token)}`;
              const wardTitle =
                code.wards?.length === 1
                  ? `${code.wards[0].ward_code || ""} ${code.wards[0].ward_name}`.trim()
                  : code.building_name;
              return (
                <div className="qr-print-page" key={code.qr_code_id}>
                  <img
                    className="qr-print-template"
                    src={printJob.templateImage}
                    alt=""
                  />
                  <div className="qr-print-title">{wardTitle}</div>
                  <div className="qr-print-bed-label">
                    {code.bed_name || "สแกนตรงนี้"}
                  </div>
                  <div className="qr-print-code">
                    <QRCodeSVG
                      value={surveyUrl}
                      size={420}
                      level="H"
                      marginSize={4}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {surveyPrintJob && (
        <div
          className="qr-print-preview"
          role="dialog"
          aria-modal="true"
          aria-label="ตัวอย่างแบบประเมิน A4"
        >
          <div className="qr-print-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.print()}
            >
              สั่งพิมพ์แบบประเมิน (A4)
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setSurveyPrintJob(null)}
            >
              ปิดตัวอย่าง
            </button>
          </div>
          <div className="qr-print-pages">
            {surveyPrintJob.codes.map((code) => {
              const wardTitle =
                code.wards?.length === 1
                  ? `${code.wards[0].ward_code || ""} ${code.wards[0].ward_name}`.trim()
                  : code.building_name;
              return (
                <div className="a4-survey-page" key={code.qr_code_id}>
                  <div className="a4-header">
                    <img
                      src="/hospital-logo.jpg"
                      alt="โลโก้โรงพยาบาลร้อยเอ็ด"
                      className="a4-logo"
                    />
                    <div>
                      <h1 className="a4-title">
                        แบบประเมินความพึงพอใจห้องพิเศษ โรงพยาบาลร้อยเอ็ด
                      </h1>
                      <p className="a4-subtitle">
                        ความคิดเห็นของท่านช่วยให้เราพัฒนาการดูแลและบริการให้ดียิ่งขึ้น
                      </p>
                    </div>
                  </div>
                  <div className="a4-section">
                    <div className="a4-section-title">
                      ส่วนที่ 1 : ข้อมูลการเข้าพัก
                    </div>
                    <div className="a4-info-grid">
                      <div>
                        <strong>หอผู้ป่วย / Ward :</strong> {wardTitle}
                      </div>
                      <div>
                        <strong>เตียง :</strong>{" "}
                        {code.bed_name ||
                          "............................................"}
                      </div>
                      <div>
                        <strong>วันที่ประเมิน :</strong> ........ / ........ /
                        ............
                      </div>
                    </div>
                    <div className="a4-checkbox-row mt-2">
                      <strong>ผู้ตอบแบบประเมิน :</strong>
                      <span>
                        <span className="a4-box" /> ผู้ป่วย
                      </span>
                      <span>
                        <span className="a4-box" /> ญาติผู้ป่วย
                      </span>
                      <span>
                        <span className="a4-box" /> อื่นๆ (ระบุ
                        ....................................)
                      </span>
                    </div>
                  </div>
                  <div className="a4-section">
                    <div className="a4-section-title">
                      ส่วนที่ 2 : ความพึงพอใจต่อบริการ (กรุณาทำเครื่องหมาย ✓
                      ลงในช่องคะแนน)
                    </div>
                    <table className="a4-rating-table">
                      <thead>
                        <tr>
                          <th style={{ width: "50%", textAlign: "left" }}>
                            หัวข้อการประเมิน
                          </th>
                          <th>
                            5<br />
                            <small>ดีมาก</small>
                          </th>
                          <th>
                            4<br />
                            <small>ดี</small>
                          </th>
                          <th>
                            3<br />
                            <small>ปานกลาง</small>
                          </th>
                          <th>
                            2<br />
                            <small>พอใช้</small>
                          </th>
                          <th>
                            1<br />
                            <small>ควรปรับปรุง</small>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {evaluationTopics.map((key, idx) => (
                          <tr key={key}>
                            <td>
                              {idx + 1}. {topicLabels[key]}
                            </td>
                            {[5, 4, 3, 2, 1].map((score) => (
                              <td key={score} className="a4-score-cell">
                                <span className="a4-star-box">☆ {score}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="a4-section">
                    <div className="a4-section-title">
                      ส่วนที่ 3 : การแจ้งปัญหาหรือสิ่งที่ขาดเหลือ
                    </div>
                    <div className="a4-checkbox-row mb-2">
                      <strong>พบปัญหาหรือไม่ :</strong>
                      <span>
                        <span className="a4-box" /> ไม่มีปัญหา
                      </span>
                      <span>
                        <span className="a4-box" />{" "}
                        มีปัญหาหรือสิ่งที่ต้องการแจ้ง
                        (กรุณาเลือกประเภทปัญหาด้านล่าง)
                      </span>
                    </div>
                    <div className="a4-category-box">
                      <div className="mb-1">
                        <strong>ประเภทปัญหา (เลือกได้มากกว่า 1 ข้อ) :</strong>
                      </div>
                      <div className="a4-category-grid">
                        {[...problemCategories]
                          .sort((a, b) => {
                            const aIsOther = a.category_name.includes("อื่น");
                            const bIsOther = b.category_name.includes("อื่น");
                            return Number(aIsOther) - Number(bIsOther);
                          })
                          .map((cat) => (
                            <div
                              className="a4-category-item"
                              key={cat.category_id}
                            >
                              <span className="a4-box" /> {cat.category_name}
                            </div>
                          ))}
                      </div>
                    </div>
                    <div className="mt-2">
                      <strong>รายละเอียดปัญหาเพิ่มเติม :</strong>
                      <div className="a4-write-line" />
                      <div className="a4-write-line" />
                    </div>
                  </div>

                  <div className="a4-section">
                    <div className="a4-section-title">
                      ส่วนที่ 4 : ข้อเสนอแนะเพิ่มเติม
                    </div>
                    <div className="a4-write-line" />
                    <div className="a4-write-line" />
                    <div className="a4-write-line" />
                  </div>

                  <div className="a4-footer">
                    ขอขอบคุณที่ร่วมแสดงความคิดเห็น —
                    ข้อมูลของท่านจะถูกนำไปใช้เพื่อพัฒนาคุณภาพบริการของโรงพยาบาลร้อยเอ็ดเท่านั้น
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [months, setMonths] = useState(12);
  const [buildingFilter, setBuildingFilter] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [hiddenLabels, setHiddenLabels] = useState([]);

  useEffect(() => {
    setHiddenLabels([]);
  }, [selectedBuilding, buildingFilter]);

  const toggleDatasetVisibility = (label) => {
    setHiddenLabels((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label],
    );
  };
  const formatRoomLabel = (roomName, buildingName) => {
    if (!roomName) return "";
    if (!buildingName) return roomName;
    return (
      roomName
        .replace(buildingName, "")
        .replace(/^[\s·\-:]+/, "")
        .trim() || roomName
    );
  };

  useEffect(() => {
    setError("");
    api
      .get("/admin/dashboard", {
        params: { months, building: selectedBuilding || buildingFilter },
      })
      .then((response) => setData(response.data))
      .catch((err) => setError(getErrorMessage(err)));
  }, [months, buildingFilter, selectedBuilding]);

  const chartMonths = data
    ? Array.from({ length: months }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - months + index + 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      })
    : [];

  const buildingNames = data
    ? data.buildings.map((item) => item.building_name)
    : [];

  const visibleBuildings = buildingNames.filter(
    (name) => !buildingFilter || name === buildingFilter,
  );

  const colors = [
    "#0062ff",
    "#ffcc00",
    "#e100f1",
    "#7e50ce",
    "#df6f6f",
    "#007087",
    "#5f76eb",
    "#78899f",
    "#ff7700",
    "#008638",
    "#00b3ff",
    "#ff1900",
    "#293476",
    "#b7a199",
    "#afb42b",
    "#35125a",
    "#30decd",
    "#74471b",
    "#e74c3c",
    "#51ff00",
    "#c885ff",
  ];

  const chartData =
    data &&
    (selectedBuilding
      ? {
          labels: chartMonths,
          datasets: [
            ...new Set(data.room_monthly.map((item) => item.room_name)),
          ].map((room, index) => {
            const displayLabel = formatRoomLabel(room, selectedBuilding);
            return {
              label: displayLabel,
              data: chartMonths.map((month) => {
                const item = data.room_monthly.find(
                  (row) => row.month === month && row.room_name === room,
                );
                return item ? Number(item.average_score) : null;
              }),
              backgroundColor: colors[index % colors.length],
              borderRadius: 4,
              hidden: hiddenLabels.includes(displayLabel),
            };
          }),
        }
      : {
          labels: chartMonths,
          datasets: visibleBuildings.map((building, index) => ({
            label: building,
            data: chartMonths.map((month) => {
              const item = data.building_monthly.find(
                (row) => row.month === month && row.building_name === building,
              );
              return item ? Number(item.average_score) : null;
            }),
            backgroundColor: colors[index % colors.length],
            borderRadius: 4,
            hidden: hiddenLabels.includes(building),
          })),
        });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: true },
    plugins: {
      legend: { display: false },
    },
    scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } },
  };

  return (
    <>
      <PageHeader
        eyebrow="OVERVIEW"
        title="ภาพรวมระบบ"
        description="สรุปผลการประเมินห้องพิเศษของโรงพยาบาล"
      />
      <Alert error={error} />
      {data && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <ClipboardList size={20} />
              </div>
              <div>
                <span>แบบประเมินทั้งหมด</span>
                <strong>
                  {Number(data.evaluation_count).toLocaleString()}
                </strong>
                <small>รายการ</small>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon gold">
                <Star size={20} />
              </div>
              <div>
                <span>คะแนนเฉลี่ย</span>
                <strong>
                  {Number(data.average_score).toFixed(2)}
                  <i> / 5</i>
                </strong>
                <small>จากทุกหัวข้อ</small>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon red">
                <TriangleAlert size={20} />
              </div>
              <div>
                <span>รายการแจ้งปัญหา</span>
                <strong>
                  {Number(data.problem_count || 0).toLocaleString()}
                </strong>
                <small>รายการ</small>
              </div>
            </div>
          </div>

          <section className="content-card dashboard-chart-card">
            <div className="dashboard-chart-heading">
              <div className="card-heading">
                <div>
                  <h2>
                    {selectedBuilding
                      ? `ผลประเมินรายห้อง · ${selectedBuilding}`
                      : "คะแนนเฉลี่ยรายเดือนแยกตามอาคาร"}
                  </h2>
                  <p>
                    {selectedBuilding
                      ? "คลิกปุ่มกลับเพื่อดูภาพรวมอาคาร"
                      : "คลิกแท่งกราฟของอาคารเพื่อดูผลประเมินรายห้อง"}
                  </p>
                </div>
              </div>
              <div className="dashboard-filters">
                {!selectedBuilding && (
                  <label>
                    อาคาร
                    <select
                      className="form-select"
                      value={buildingFilter}
                      onChange={(event) =>
                        setBuildingFilter(event.target.value)
                      }
                    >
                      <option value="">ทุกอาคาร</option>
                      {buildingNames.map((building) => (
                        <option key={building} value={building}>
                          {building}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  ช่วงเวลา
                  <select
                    className="form-select"
                    value={months}
                    onChange={(event) => setMonths(Number(event.target.value))}
                  >
                    <option value={3}>3 เดือน</option>
                    <option value={6}>6 เดือน</option>
                    <option value={12}>12 เดือน</option>
                  </select>
                </label>
                {selectedBuilding && (
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => setSelectedBuilding("")}
                  >
                    กลับสู่อาคาร
                  </button>
                )}
              </div>
            </div>

            {chartData && (
              <div className="dashboard-chart-wrapper">
                <div className="dashboard-chart">
                  <Bar
                    data={chartData}
                    options={{
                      ...chartOptions,
                      onClick: (_, elements) => {
                        if (selectedBuilding || elements.length === 0) return;

                        const idx = elements[0].datasetIndex;
                        const clickedBuilding =
                          chartData.datasets?.[idx]?.label;

                        if (clickedBuilding) {
                          setSelectedBuilding(clickedBuilding);
                        }
                      },
                    }}
                  />
                  {!chartData.datasets.some((dataset) =>
                    dataset.data.some((value) => value !== null),
                  ) && (
                    <div className="empty-state">
                      ยังไม่มีข้อมูลการประเมินในช่วงเวลานี้
                    </div>
                  )}
                </div>
                <div className="custom-legend-box">
                  {chartData.datasets.map((dataset, idx) => {
                    const isHidden = hiddenLabels.includes(dataset.label);
                    return (
                      <button
                        type="button"
                        className={`custom-legend-item ${isHidden ? "is-hidden" : ""}`}
                        key={`${dataset.label}-${idx}`}
                        onClick={() => toggleDatasetVisibility(dataset.label)}
                        aria-pressed={isHidden}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          opacity: isHidden ? 0.45 : 1,
                        }}
                      >
                        <span
                          className="custom-legend-swatch"
                          style={{
                            backgroundColor: Array.isArray(
                              dataset.backgroundColor,
                            )
                              ? dataset.backgroundColor[0]
                              : dataset.backgroundColor,
                          }}
                        />
                        <span
                          className="custom-legend-label"
                          style={{
                            textDecoration: isHidden ? "line-through" : "none",
                          }}
                        >
                          {dataset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="content-card top-rooms">
            <div className="card-heading">
              <div>
                <h2>เตียงที่มีการประเมินสูง</h2>
                <p>เรียงตามจำนวนแบบประเมิน</p>
              </div>
            </div>
            {data.top_rooms.length ? (
              <div className="table-responsive">
                <table className="table align-middle">
                  <thead>
                    <tr>
                      <th>เตียง</th>
                      <th>จำนวน</th>
                      <th>คะแนนเฉลี่ย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_rooms.map((item, index) => (
                      <tr key={`${item.ward_name}-${item.bed_name}`}>
                        <td>
                          <span className="rank">{index + 1}</span>
                          <b>
                            {item.ward_name} · {item.bed_name}
                          </b>
                        </td>
                        <td>{item.evaluation_count}</td>
                        <td>
                          <span className="score-pill">
                            <Star size={13} fill="currentColor" />
                            {Number(item.average_score).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">ยังไม่มีข้อมูลการประเมิน</div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Evaluations() {
  const [data, setData] = useState({ data: [], pagination: {} });
  const [wards, setWards] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    ward_id: "",
    from: "",
    to: "",
    has_problem: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [loadingRows, setLoadingRows] = useState(false);
  const loadSequence = useRef(0);
  const [openFilterWardPicker, setOpenFilterWardPicker] = useState(false);
  const wardFilterPickerRef = useRef(null);

  // ปิด Dropdown เมื่อคลิกหรือแตะพื้นที่ใดก็ตามที่อยู่นอกช่องเลือก Ward
  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        wardFilterPickerRef.current &&
        !wardFilterPickerRef.current.contains(event.target)
      ) {
        setOpenFilterWardPicker(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, []);

  const load = async (requestedPage = page) => {
    const sequence = ++loadSequence.current;
    setLoadingRows(true);
    setError("");

    try {
      if (pageSize === "ALL") {
        // ป้องกันการดึงข้อมูลจำนวนมหาศาลเข้าหน้าเว็บและสร้าง DOM มากเกินไป
        const countResponse = await api.get("/admin/evaluations", {
          params: { ...filters, page: 1, limit: 1 },
        });
        const total = Number(countResponse.data?.pagination?.total || 0);
        const ALL_ROWS_SAFE_LIMIT = 5000;

        if (total > ALL_ROWS_SAFE_LIMIT) {
          if (sequence === loadSequence.current) {
            setNotice(
              `พบข้อมูล ${total.toLocaleString("th-TH")} รายการ เพื่อป้องกันหน้าเว็บทำงานหนัก ระบบเปลี่ยนเป็นแสดง 100 แถวต่อหน้าให้อัตโนมัติ คุณยังเปิดดูข้อมูลทั้งหมดได้ด้วยการเปลี่ยนหน้า หรือใช้ตัวกรองให้แคบลง`,
            );
            setPageSize("100");
            setPage(1);
          }
          return;
        }

        if (total === 0) {
          if (sequence === loadSequence.current) {
            setData({
              data: [],
              pagination: { total: 0, limit: 1, page: 1 },
            });
          }
          return;
        }

        // ดึงทีละชุด ไม่ส่งคำขอเดียวที่มี limit หลายพัน/หลายหมื่นแถว
        const firstResponse = await api.get("/admin/evaluations", {
          params: { ...filters, page: 1, limit: Math.min(500, total) },
        });
        const firstRows = firstResponse.data?.data || [];
        const rows = [...firstRows];
        const batchSize = Math.max(
          1,
          Number(firstResponse.data?.pagination?.limit) ||
            firstRows.length ||
            500,
        );
        const totalPages = Math.ceil(total / batchSize);

        for (let batchPage = 2; batchPage <= totalPages; batchPage += 1) {
          if (sequence !== loadSequence.current) return;
          const batchResponse = await api.get("/admin/evaluations", {
            params: { ...filters, page: batchPage, limit: batchSize },
          });
          const batchRows = batchResponse.data?.data || [];
          rows.push(...batchRows);
          if (!batchRows.length) break;
        }

        if (sequence === loadSequence.current) {
          setData({
            data: rows,
            pagination: {
              ...(firstResponse.data?.pagination || {}),
              total,
              limit: Math.max(total, 1),
              page: 1,
            },
          });
        }
        return;
      }

      const response = await api.get("/admin/evaluations", {
        params: { ...filters, page: requestedPage, limit: Number(pageSize) },
      });
      if (sequence === loadSequence.current) setData(response.data);
    } catch (err) {
      if (sequence === loadSequence.current) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (sequence === loadSequence.current) setLoadingRows(false);
    }
  };

  useEffect(() => {
    api.get("/admin/wards").then((response) => setWards(response.data));
  }, []);

  useEffect(() => {
    load();
    return () => {
      loadSequence.current += 1;
    };
  }, [page, pageSize]);

  function changePageSize(value) {
    setNotice("");
    setPage(1);
    setPageSize(value);
  }

  function search(event) {
    event.preventDefault();
    setNotice("");
    setPage(1);
    load(1);
  }

  async function exportCsv() {
    try {
      const response = await api.get("/admin/export/csv", {
        params: filters,
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "evaluations.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }
  return (
    <>
      <style>{`
        .evaluations-filter-bar {
          display: grid;
          width: 100%;
          max-width: none;
          min-width: 0;
          /* PC: จัดตัวกรองทั้ง 6 ช่องให้อยู่ในแถวเดียว */
          grid-template-columns:
            minmax(0, 1.2fr)
            minmax(0, 1.1fr)
            minmax(0, 1.1fr)
            minmax(0, 1fr)
            minmax(0, 1fr)
            auto;
          align-items: end;
          gap: 10px;
          padding: 14px 16px;
          /* ให้ dropdown ลอยเหนือการ์ดถัดไป โดยไม่เพิ่มความสูงของฟอร์ม */
          position: relative;
          z-index: 50;
          overflow: visible !important;
        }
        .evaluations-filter-bar .search-field,
        .evaluations-filter-bar .ward-filter-picker > button,
        .evaluations-filter-bar > select {
          min-height: 46px;
          height: 46px;
          box-sizing: border-box;
        }
        .evaluations-filter-bar .search-field {
          height: 46px;
        }
        .evaluations-filter-bar > .btn {
          width: auto;
          min-width: 104px;
          height: 46px;
          min-height: 46px;
          padding: 10px 20px;
          white-space: nowrap;
          justify-self: end;
        }
        .evaluations-filter-bar > *,
        .evaluations-filter-bar .search-field,
        .evaluations-filter-bar .ward-filter-picker {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }
        .evaluations-filter-bar .date-filter-field {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 6px;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }
        .evaluations-filter-bar .date-filter-field label {
          display: block;
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.35;
          font-weight: 500;
        }
        .evaluations-filter-bar .date-filter-field input[type="date"] {
          display: block;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          min-height: 46px;
          box-sizing: border-box;
          color: #263445;
          background-color: #fff;
          color-scheme: light;
          font-size: 14px;
          line-height: 1.4;
          padding: 10px 42px 10px 12px;
          position: relative;
          z-index: 2;
          -webkit-appearance: auto;
          appearance: auto;
        }
        .evaluations-filter-bar .date-filter-field input[type="date"]::-webkit-datetime-edit {
          color: #263445;
          opacity: 1;
        }
        .evaluations-filter-bar .date-filter-field input[type="date"]::-webkit-calendar-picker-indicator {
          opacity: 0;
          position: absolute;
          right: 0;
          width: 44px;
          height: 100%;
          cursor: pointer;
        }
        .evaluations-filter-bar .date-filter-placeholder {
          position: absolute;
          left: 13px;
          bottom: 14px;
          z-index: 3;
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.4;
          pointer-events: none;
          user-select: none;
        }
        .evaluations-filter-bar .date-filter-field::after {
          content: "";
          position: absolute;
          right: 14px;
          bottom: 13px;
          width: 20px;
          height: 20px;
          z-index: 3;
          pointer-events: none;
          background-repeat: no-repeat;
          background-position: center;
          background-size: contain;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M16 3v4M8 3v4M3 10h18'/%3E%3C/svg%3E");
        }
        .evaluations-filter-bar .search-field input,
        .evaluations-filter-bar > select,
        .evaluations-filter-bar > input[type="date"] {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }
        .evaluations-filter-bar .ward-filter-picker {
          position: relative;
          align-self: end;
          z-index: 1;
          min-height: 46px;
        }
        /* ยกเฉพาะช่อง Ward ขึ้นมาเมื่อเปิดรายการ */
        .evaluations-filter-bar .ward-filter-picker:has(.ward-filter-options) {
          z-index: 100;
        }
        .evaluations-filter-bar .ward-filter-picker > button {
          display: block;
          width: 100%;
          min-width: 0;
          min-height: 44px;
          height: auto;
          padding: 9px 36px 9px 10px;
          font-size: 14px;
          line-height: 1.4;
          text-align: left;
          white-space: normal;
          overflow-wrap: anywhere;
          background-position: right 10px center;
          background-size: 12px;
          box-sizing: border-box;
        }
        .evaluations-filter-bar .ward-filter-options {
          /* แสดงเป็น overlay ใต้ปุ่ม ไม่อยู่ใน flow ของ Grid */
          position: absolute !important;
          top: calc(100% + 6px) !important;
          bottom: auto !important;
          left: 0 !important;
          right: auto !important;
          transform: none !important;
          margin: 0 !important;
          width: 100% !important;
          min-width: 100% !important;
          max-width: min(320px, 90vw) !important;
          max-height: min(260px, 45vh) !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          box-sizing: border-box;
          z-index: 1000 !important;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16) !important;
        }
        .evaluations-filter-bar + .content-card {
          position: relative;
          z-index: 0;
        }
        .evaluations-filter-bar .ward-filter-options .dropdown-item {
          display: block;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          padding: 9px 10px;
          font-size: 14px;
          line-height: 1.4;
          text-align: left;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: normal;
          box-sizing: border-box;
        }
        /* Tablet: ใช้ 2 คอลัมน์เมื่อมีพื้นที่เพียงพอ */
        @media (min-width: 601px) and (max-width: 1199px) {
          .evaluations-filter-bar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .evaluations-filter-bar .search-field,
          .evaluations-filter-bar .ward-filter-picker {
            grid-column: 1 / -1;
          }
        }

        /* Mobile: เรียงทุกตัวกรองลงมาเต็มความกว้าง ป้องกันข้อความและวันที่ถูกบีบ */
        @media (max-width: 600px) {
          .evaluations-filter-bar {
            grid-template-columns: minmax(0, 1fr);
            gap: 10px;
            padding: 12px;
          }
          .evaluations-filter-bar > *,
          .evaluations-filter-bar .search-field,
          .evaluations-filter-bar .ward-filter-picker {
            grid-column: 1 / -1;
            width: 100%;
            min-width: 0;
            max-width: 100%;
          }
          .evaluations-filter-bar .search-field {
            min-height: 46px;
            height: auto;
          }
          .evaluations-filter-bar .search-field input {
            min-width: 0;
            font-size: 14px;
          }
          .evaluations-filter-bar .ward-filter-picker > button {
            min-height: 46px;
            font-size: 14px;
            padding: 10px 36px 10px 12px;
            background-position: right 10px center;
          }
          .evaluations-filter-bar > select {
            min-height: 46px;
            height: auto;
            width: 100%;
            min-width: 0;
            font-size: 14px;
            line-height: 1.4;
            padding: 10px 34px 10px 12px;
            box-sizing: border-box;
          }
          .evaluations-filter-bar .date-filter-field {
            grid-column: 1 / -1;
            width: 100%;
            min-width: 0;
          }
          .evaluations-filter-bar .date-filter-field input[type="date"] {
            min-height: 46px;
            width: 100%;
            padding: 10px 12px;
            font-size: 14px;
          }
          .evaluations-filter-bar .ward-filter-options {
            max-height: 190px !important;
          }
          .evaluations-filter-bar .ward-filter-options .dropdown-item {
            font-size: 14px;
            padding: 9px 10px;
          }
          .evaluations-filter-bar > .btn {
            min-height: 46px;
            width: 100%;
          }
        }
      `}</style>
      <PageHeader
        eyebrow="FEEDBACK"
        title="ผลการประเมิน"
        description="ค้นหา ตรวจสอบคะแนน และดูรายละเอียดความคิดเห็น"
      >
        <button className="btn btn-outline-primary" onClick={exportCsv}>
          <FileDown size={16} className="me-2" />
          ส่งออก CSV
        </button>
      </PageHeader>
      <Alert error={error} />
      {notice && (
        <div className="alert alert-warning" role="status">
          {notice}
        </div>
      )}
      <form className="filter-bar evaluations-filter-bar" onSubmit={search}>
        <div className="search-field">
          <Search size={17} />
          <input
            placeholder="ค้นหาอาคาร Ward หรือเตียง"
            value={filters.q}
            onChange={(event) =>
              setFilters({ ...filters, q: event.target.value })
            }
          />
        </div>
        <div
          ref={wardFilterPickerRef}
          className="position-relative ward-filter-picker"
        >
          <button
            type="button"
            className="form-select text-start"
            aria-label="กรองตาม Ward"
            aria-expanded={openFilterWardPicker}
            onClick={() => setOpenFilterWardPicker((previous) => !previous)}
          >
            {filters.ward_id
              ? wards.find(
                  (ward) => String(ward.ward_id) === String(filters.ward_id),
                )?.ward_name || "ทุก Ward"
              : "ทุก Ward"}
          </button>
          {openFilterWardPicker && (
            <div
              className="dropdown-menu show w-100 p-1 shadow-sm ward-filter-options"
              role="listbox"
              style={{
                maxHeight: 190,
                overflowY: "auto",
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch",
                zIndex: 30,
              }}
            >
              <button
                type="button"
                className={`dropdown-item rounded py-2 text-start ${
                  !filters.ward_id ? "active" : ""
                }`}
                onClick={() => {
                  setFilters({ ...filters, ward_id: "" });
                  setOpenFilterWardPicker(false);
                }}
              >
                ทุก Ward
              </button>
              {wards.map((ward) => (
                <button
                  type="button"
                  key={ward.ward_id}
                  className={`dropdown-item rounded py-2 text-start ${
                    String(filters.ward_id) === String(ward.ward_id)
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setFilters({
                      ...filters,
                      ward_id: String(ward.ward_id),
                    });
                    setOpenFilterWardPicker(false);
                  }}
                >
                  {ward.ward_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          className="form-select"
          aria-label="กรองตามสถานะปัญหา"
          value={filters.has_problem}
          onChange={(event) =>
            setFilters({ ...filters, has_problem: event.target.value })
          }
        >
          <option value="">มีและไม่มีปัญหา</option>
          <option value="1">มีปัญหา</option>
          <option value="0">ไม่มีปัญหา</option>
        </select>
        <div className="date-filter-field">
          <label htmlFor="evaluations-date-from">ตั้งแต่วันที่</label>
          <input
            id="evaluations-date-from"
            className="form-control"
            type="date"
            aria-label="ตั้งแต่วันที่"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
          {!filters.from && (
            <span className="date-filter-placeholder" aria-hidden="true">
              วว/ดด/ปปปป
            </span>
          )}
        </div>
        <div className="date-filter-field">
          <label htmlFor="evaluations-date-to">ถึงวันที่</label>
          <input
            id="evaluations-date-to"
            className="form-control"
            type="date"
            aria-label="ถึงวันที่"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
          {!filters.to && (
            <span className="date-filter-placeholder" aria-hidden="true">
              วว/ดด/ปปปป
            </span>
          )}
        </div>
        <button className="btn btn-primary">ค้นหา</button>
      </form>
      <section className="content-card">
        <div className="evaluations-page-size">
          <label htmlFor="evaluations-page-size-select">แสดง</label>
          <select
            id="evaluations-page-size-select"
            value={pageSize}
            onChange={(event) => changePageSize(event.target.value)}
            aria-label="จำนวนแถวที่แสดง"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="ALL">ALL</option>
          </select>
          <span>แถว</span>
          {pageSize === "ALL" && (
            <small>โหลดข้อมูลเป็นชุดเพื่อช่วยลดภาระการเชื่อมต่อ</small>
          )}
          {loadingRows && <small role="status">กำลังโหลดข้อมูล...</small>}
        </div>
        <div className="table-responsive">
          <table className="table data-table align-middle">
            <thead>
              <tr>
                <th>เตียง</th>
                <th>ผู้ประเมิน</th>
                <th>คะแนน</th>
                <th>แจ้งปัญหา</th>
                <th>วันที่</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((item) => (
                <tr key={item.evaluation_id}>
                  <td>
                    <b>
                      {item.building_name}
                      {item.ward_name && item.ward_name !== item.building_name
                        ? ` · ${item.ward_name}`
                        : ""}{" "}
                      · {item.bed_name || "ไม่ระบุเตียง"}
                    </b>
                    <small>#{item.evaluation_id}</small>
                  </td>
                  <td>
                    {respondentLabels[item.respondent_type] ||
                      item.respondent_type}
                  </td>
                  <td>
                    <span className="score-pill">
                      <Star size={13} fill="currentColor" />
                      {Number(item.overall_score).toFixed(2)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status ${item.has_problem ? "status-warning" : "status-ok"}`}
                    >
                      {item.has_problem ? "มีปัญหา" : "ไม่มี"}
                    </span>
                  </td>
                  <td>
                    {new Date(item.created_at).toLocaleDateString("th-TH")}
                  </td>
                  <td>
                    <Link
                      className="table-link"
                      to={`/admin/evaluations/${item.evaluation_id}`}
                    >
                      ดูรายละเอียด →
                    </Link>
                  </td>
                </tr>
              ))}
              {!data.data.length && (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">
                      {loadingRows
                        ? "กำลังโหลดข้อมูล..."
                        : "ไม่พบข้อมูลการประเมิน"}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pages={Math.max(
            1,
            Math.ceil(
              (data.pagination.total || 0) /
                (data.pagination.limit ||
                  (pageSize === "ALL"
                    ? Math.max(data.pagination.total || 1, 1)
                    : Number(pageSize))),
            ),
          )}
          onChange={setPage}
        />
      </section>
    </>
  );
}
function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;

  return (
    <>
      {/* รูปแบบเดิมสำหรับ PC */}
      <div className="pagination-row evaluations-pagination-desktop">
        <span>
          หน้า {page} จาก {pages}
        </span>
        <div>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            ก่อนหน้า
          </button>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
          >
            ถัดไป
          </button>
        </div>
      </div>

      {/* Flexing arrows สำหรับมือถือและ iPad */}
      <nav className="flexing-pagination" aria-label="เปลี่ยนหน้าผลการประเมิน">
        <button
          type="button"
          className="flexing-pagination-arrow is-previous"
          aria-label="หน้าก่อนหน้า"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <span className="flexing-arrow-icon" aria-hidden="true">
            ‹
          </span>
          <span className="flexing-arrow-label">ก่อนหน้า</span>
        </button>

        <span className="flexing-pagination-current" aria-live="polite">
          <strong>{page}</strong>
          <span>/</span>
          <span>{pages}</span>
        </span>

        <button
          type="button"
          className="flexing-pagination-arrow is-next"
          aria-label="หน้าถัดไป"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <span className="flexing-arrow-label">ถัดไป</span>
          <span className="flexing-arrow-icon" aria-hidden="true">
            ›
          </span>
        </button>
      </nav>
    </>
  );
}

function EvaluationDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get(`/admin/evaluations/${id}`)
      .then((response) => setItem(response.data))
      .catch((err) => setError(getErrorMessage(err)));
  }, [id]);
  return (
    <>
      <PageHeader
        eyebrow="EVALUATION DETAIL"
        title="รายละเอียดผลประเมิน"
        description={`แบบประเมิน #${id}`}
      >
        <Link className="btn btn-outline-secondary" to="/admin/evaluations">
          กลับรายการ
        </Link>
      </PageHeader>
      <Alert error={error} />
      {item && (
        <div className="detail-grid">
          <section className="content-card detail-card">
            <h2>ข้อมูลการประเมิน</h2>
            <dl className="detail-list">
              <dt>อาคาร / Ward / เตียง</dt>
              <dd>
                {item.building_name}
                {item.ward_name && item.ward_name !== item.building_name
                  ? ` · ${item.ward_name}`
                  : ""}{" "}
                · {item.bed_name || "ไม่ระบุเตียง"}
              </dd>
              <dt>ผู้ประเมิน</dt>
              <dd>
                {respondentLabels[item.respondent_type] || item.respondent_type}
              </dd>
              <dt>คะแนนเฉลี่ย</dt>
              <dd>
                <span className="score-pill">
                  <Star size={13} fill="currentColor" />
                  {Number(item.overall_score).toFixed(2)} / 5
                </span>
              </dd>
              <dt>วันที่</dt>
              <dd>{new Date(item.created_at).toLocaleString("th-TH")}</dd>
              <dt>ข้อเสนอแนะ</dt>
              <dd>{item.suggestion || "—"}</dd>
            </dl>
          </section>
          <section className="content-card detail-card">
            <h2>คะแนนรายหัวข้อ</h2>
            {item.scores.map((score) => (
              <div className="score-detail" key={score.topic_code}>
                <span>{topicLabels[score.topic_code] || score.topic_code}</span>
                <b>
                  <Star size={14} fill="currentColor" /> {score.score} / 5
                </b>
              </div>
            ))}
          </section>
          <section className="content-card detail-card full-width">
            <h2>รายการแจ้งปัญหา</h2>
            {item.problem_reports.length ? (
              item.problem_reports.map((report) => (
                <div className="report-detail" key={report.report_id}>
                  <div className="report-meta">
                    {report.categories || "ไม่ระบุหมวดหมู่"} ·{" "}
                    {new Date(report.created_at).toLocaleString("th-TH")}
                  </div>
                  <p>{report.description || "ไม่ได้ระบุรายละเอียด"}</p>
                  <div className="image-list">
                    {report.images.map((image) => (
                      <a
                        key={image.image_id}
                        href={problemImageUrl(image.image_id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={problemImageUrl(image.image_id)}
                          alt={image.original_filename}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">ไม่มีรายการแจ้งปัญหา</div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Reports() {
  const [reports, setReports] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");

  const load = () =>
    api
      .get("/admin/problem-reports", { params: { q: query } })
      .then((response) => {
        setReports(response.data);
        setPage(1);
        setError("");
      })
      .catch((err) => setError(getErrorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  const totalPages =
    pageSize === "ALL"
      ? 1
      : Math.max(1, Math.ceil(reports.length / Number(pageSize)));
  const visibleReports =
    pageSize === "ALL"
      ? reports
      : reports.slice((page - 1) * Number(pageSize), page * Number(pageSize));

  function changePageSize(value) {
    setPageSize(value);
    setPage(1);
  }

  return (
    <>
      <PageHeader
        eyebrow="ISSUE REPORTS"
        title="รายการแจ้งปัญหา"
        description="ติดตามปัญหาและสิ่งที่ต้องปรับปรุงจากผู้ใช้บริการ"
      />
      <Alert error={error} />
      <form
        className="filter-bar compact-filter"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="search-field">
          <Search size={17} />
          <input
            placeholder="ค้นหาปัญหา อาคาร หรือเตียง"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button className="btn btn-primary">ค้นหา</button>
      </form>
      <section className="content-card">
        <div className="evaluations-page-size">
          <label htmlFor="reports-page-size-select">แสดง</label>
          <select
            id="reports-page-size-select"
            value={pageSize}
            onChange={(event) => changePageSize(event.target.value)}
            aria-label="จำนวนแถวที่แสดง"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="ALL">ALL</option>
          </select>
          <span>แถว</span>
        </div>
        <div className="table-responsive">
          <table className="table data-table align-middle">
            <thead>
              <tr>
                <th>เตียง</th>
                <th>รายละเอียด</th>
                <th>หมวดหมู่</th>
                <th>รูปภาพ</th>
                <th>วันที่</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleReports.map((report) => (
                <tr key={report.report_id}>
                  <td>
                    <b>
                      {report.building_name}
                      {report.ward_name &&
                      report.ward_name !== report.building_name
                        ? ` · ${report.ward_name}`
                        : ""}{" "}
                      · {report.bed_name || "ไม่ระบุเตียง"}
                    </b>
                    <small>รายงาน #{report.report_id}</small>
                  </td>
                  <td className="description-cell">
                    {report.description || "ไม่ระบุรายละเอียด"}
                  </td>
                  <td>{report.categories || "—"}</td>
                  <td>{report.image_count}</td>
                  <td>
                    {new Date(report.created_at).toLocaleDateString("th-TH")}
                  </td>
                  <td>
                    <Link
                      className="table-link"
                      to={`/admin/reports/${report.report_id}`}
                    >
                      ดูรายละเอียด →
                    </Link>
                  </td>
                </tr>
              ))}
              {!visibleReports.length && (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">ไม่พบรายการแจ้งปัญหา</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={totalPages} onChange={setPage} />
      </section>
    </>
  );
}

function ReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get(`/admin/problem-reports/${id}`)
      .then((response) => setReport(response.data))
      .catch((err) => setError(getErrorMessage(err)));
  }, [id]);
  return (
    <>
      <PageHeader
        eyebrow="REPORT DETAIL"
        title="รายละเอียดการแจ้งปัญหา"
        description={`รายการ #${id}`}
      >
        <Link className="btn btn-outline-secondary" to="/admin/reports">
          กลับรายการ
        </Link>
      </PageHeader>
      <Alert error={error} />
      {report && (
        <section className="content-card detail-card">
          <h2>
            {report.building_name}
            {report.ward_name && report.ward_name !== report.building_name
              ? ` · ${report.ward_name}`
              : ""}{" "}
            · {report.bed_name || "ไม่ระบุเตียง"}
          </h2>
          <p className="report-meta">
            {report.categories || "ไม่ระบุหมวดหมู่"} ·{" "}
            {new Date(report.created_at).toLocaleString("th-TH")}
          </p>
          <p>{report.description || "ไม่ได้ระบุรายละเอียด"}</p>
          <div className="image-list">
            {report.images.map((image) => (
              <a
                key={image.image_id}
                href={problemImageUrl(image.image_id)}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={problemImageUrl(image.image_id)}
                  alt={image.original_filename}
                />
              </a>
            ))}
          </div>
          <Link to={`/admin/evaluations/${report.evaluation_id}`}>
            ดูแบบประเมินที่เกี่ยวข้อง →
          </Link>
        </section>
      )}
    </>
  );
}

function AdminPage({ children }) {
  return (
    <AdminLayout>
      <div className="admin-content">{children}</div>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EvaluationForm />} />
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <AdminPage>
            <Dashboard />
          </AdminPage>
        }
      />
      <Route
        path="/admin/qr-codes"
        element={
          <AdminPage>
            <QrManagement />
          </AdminPage>
        }
      />
      <Route
        path="/admin/evaluations"
        element={
          <AdminPage>
            <Evaluations />
          </AdminPage>
        }
      />
      <Route
        path="/admin/evaluations/:id"
        element={
          <AdminPage>
            <EvaluationDetail />
          </AdminPage>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <AdminPage>
            <Reports />
          </AdminPage>
        }
      />
      <Route
        path="/admin/reports/:id"
        element={
          <AdminPage>
            <ReportDetail />
          </AdminPage>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
