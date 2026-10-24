$(document).ready(function () {
  let questions = [];
  let listQues = [];
  let answers = [];
  const made = $("#dethicontent").data("id");
  const userId = $("#dethicontent").data("user") || "guest";

  const dethiKey = `dethi_${made}_user_${userId}`;
  const answerKey = `cautraloi_${made}_user_${userId}`;
  let submitting = false;
  let submitted = false;
  let timeExpired = false;
  let tabViolation = false;
  let resolveQuestions;
  const questionsReady = new Promise((resolve) => { resolveQuestions = resolve; });
  const pendingImageReads = new Set();

  function trackImageChange(handler) {
    return (event) => {
      const task = handler(event);
      pendingImageReads.add(task);
      task.catch((error) => Swal.fire("Lỗi ảnh", error.message, "error"))
        .finally(() => pendingImageReads.delete(task));
    };
  }

  function trackImageRead(reader) {
    const handleLoad = reader.onload;
    const task = new Promise((resolve, reject) => {
      reader.onload = async (event) => {
        try { await handleLoad(event); resolve(); } catch (error) { reject(error); }
      };
      reader.onerror = () => reject(new Error("Không đọc được ảnh đã chọn"));
    });
    pendingImageReads.add(task);
    task.catch((error) => Swal.fire("Lỗi ảnh", error.message, "error"))
      .finally(() => pendingImageReads.delete(task));
  }

  // ==================== INDEXEDDB CHO ẢNH TỰ LUẬN ====================
  let db;
  const dbPromise = (typeof idb === "undefined" ? Promise.resolve(null) : idb.openDB("exam-images-db-v3", 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore("images", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by_exam_user_question", [
          "answerKey",
          "questionIndex",
        ]);
      }
    },
  })).catch((error) => { console.warn("Không mở được kho ảnh nháp", error); return null; });

  (async () => {
    try {
      db = await dbPromise;
      console.log("IndexedDB sẵn sàng");
    } catch (err) {
      console.error("Lỗi IndexedDB:", err);
    }
  })();

  async function saveImageToDB(qIndex, base64) {
    if (!base64 || base64.length < 100) return;
    const db = await dbPromise;
    if (!db) throw new Error("Không mở được kho ảnh nháp. Vui lòng tải lại trang trước khi thêm ảnh.");
    await db.add("images", {
      answerKey,
      questionIndex: listQues[qIndex].macauhoi,
      questionId: listQues[qIndex].macauhoi,
      base64: base64.trim(),
      timestamp: Date.now(),
    });
  }

  async function getImagesForQuestion(qIndex) {
    const db = await dbPromise;
    if (!db) return [];
    const questionId = listQues[qIndex]?.macauhoi;
    if (questionId == null) return [];
    const current = await db.getAllFromIndex("images", "by_exam_user_question",
      IDBKeyRange.bound([answerKey, questionId], [answerKey, questionId, []]));
    return current.filter((row) => row.questionId === questionId);
  }

  // Nháp v3 lưu vị trí cũ. Chỉ khôi phục khi nháp text chứng minh được mã câu.
  async function migrateLegacyImages(savedAnswers) {
    if (!savedAnswers.length) return;
    const db = await dbPromise;
    if (!db) return;
    const essayIds = new Set(listQues.filter((q) => q.loai === "essay").map((q) => q.macauhoi));
    for (const row of await db.getAll("images")) {
      if (row.answerKey !== answerKey || row.questionId != null) continue;
      if (!Number.isInteger(row.questionIndex) || row.questionIndex < 0) continue;
      const originalAnswer = savedAnswers[row.questionIndex];
      // Nháp mới được lưu theo thứ tự hiện tại, không chứng minh vị trí ảnh v3 cũ.
      if (originalAnswer?.imagesByQuestionId) continue;
      const questionId = originalAnswer?.macauhoi;
      if (!essayIds.has(questionId)) continue;
      await db.put("images", { ...row, questionIndex: questionId, questionId });
    }
  }

  async function deleteImageFromDB(qIndex, base64) {
    const db = await dbPromise;
    if (!db) return;
    const all = await db.getAll("images");
    const item = all.find(
      (i) =>
        i.answerKey === answerKey &&
        i.questionId === listQues[qIndex]?.macauhoi &&
        i.base64 === base64
    );
    if (item) await db.delete("images", item.id);
  }

  async function clearImagesForExam() {
    const db = await dbPromise;
    if (!db) return;
    const all = await db.getAll("images");
    const tx = db.transaction("images", "readwrite");
    all
      .filter((i) => i.answerKey === answerKey)
      .forEach((i) => tx.store.delete(i.id));
    await tx.done;
  }

  function compressImage(base64) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error("File đã chọn không phải ảnh hợp lệ"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1400;
        let { width, height } = img;
        if (width > MAX) {
          height = (MAX / width) * height;
          width = MAX;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = base64;
    });
  }

  // ==================== CHẾ ĐỘ HIỂN THỊ ====================
  let displayMode = "full";
  let currentQuestionIndex = 0;
  const imageCache = new Map();

  function switchDisplayMode(mode) {
    displayMode = mode;
    currentQuestionIndex = 0;
    $("#mode-full")
      .toggleClass("active btn-primary text-white", mode === "full")
      .toggleClass("btn-outline-primary", mode !== "full");
    $("#mode-one")
      .toggleClass("active btn-success text-white", mode === "one")
      .toggleClass("btn-outline-success", mode !== "one");
    renderCurrentView();
  }

  function renderCurrentView() {
    $("#list-question").empty();

    if (displayMode === "full") {
      showListQuestion(listQues, answers);
    } else {
      showOneQuestionOrGroup(currentQuestionIndex);
    }

    updateNavigationButtons();
    showBtnSideBar(listQues, answers);
  }

  // ==================== HIỂN THỊ ẢNH (Base64 → Blob URL) ====================
  const renderImage = (imgData) => {
    if (!imgData || imgData.trim() === "") return "";
    let src = imgData.trim();
    if (src.match(/^\/9j\/|data:image\/|iVBORw0KGgo/)) {
      if (!imageCache.has(src)) {
        try {
          const binary = atob(src.includes(",") ? src.split(",")[1] : src);
          const array = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          const blob = new Blob([array], { type: "image/jpeg" });
          imageCache.set(src, URL.createObjectURL(blob));
        } catch (e) {
          return `<div class="text-center text-danger my-3">Lỗi ảnh</div>`;
        }
      }
      src = imageCache.get(src);
    }
    return `<div class="text-center my-3">
      <img src="${src}" class="img-fluid rounded shadow-sm border" style="max-height:340px; object-fit:contain; cursor:pointer" loading="lazy" onclick="window.open(this.src,'_blank')">
    </div>`;
  };

  // ==================== HTML CHO 1 CÂU HỎI (DÙNG CHUNG) ====================
  function generateQuestionHTML(q, idx, inGroup = false) {
    const ans = answers[idx] || {};
    const chosen = ans.cautraloi || null;
    const isEssay = q.loai === "essay";

    let html = `
    <div class="question card shadow-lg mb-4 ${
      inGroup ? "border-start border-primary border-5" : ""
    }" id="q-${idx + 1}">
      <div class="card-body p-5">
        <h4 class="fw-bold mb-4"  style="
        display:inline-block;background:var(--color-chalk-canvas);color:var(--color-ink-charcoal);
        padding:6px 12px;
        border-radius:8px">Câu ${idx + 1}: ${q.noidung}</h4>
        ${renderImage(q.hinhanh)}`;

    if (isEssay) {
      html += `<div id="essay-container-${idx}"></div>`;
    } else {
      html += `<div class="row g-4 mb-5">`;
      q.cautraloi.forEach((ctl, i) => {
        const content = ctl.noidungtl || ctl.content || "";
        const img = ctl.hinhanhtl || ctl.hinhanh || "";
        html += `
        <div class="col-12 col-md-6">
          <div class="border rounded-4 p-4 bg-white shadow-sm h-100 d-flex align-items-center gap-4 hover-shadow-lg" style="border:2px solid var(--color-mist-border); min-height:140px">
            <div class="flex-shrink-0 d-flex align-items-center justify-content-center rounded-circle bg-primary text-white fw-bold fs-4 shadow" style="width:56px;height:56px">
              ${String.fromCharCode(65 + i)}
            </div>
            <div class="flex-grow-1">
              <div class="lh-base fs-5">${content}</div>
              ${renderImage(img)}
            </div>
          </div>
        </div>`;
      });
      html += `</div>`;
      html += createAnswerButtons(q, idx, chosen, q.loai === "reading");
    }
    html += `</div></div>`;
    return html;
  }

  function showOneQuestionOrGroup(idx) {
    if (idx < 0 || idx >= listQues.length) return;

    let html = "";
    const q = listQues[idx];

    if (q.loai === "reading" && q.context?.trim()) {
      const context = q.context.trim();
      const title = q.tieude_context || "Đoạn văn";

      const group = listQues.filter(
        (x) => x.loai === "reading" && (x.context || "").trim() === context
      );

      html += `
      <div class="card shadow-lg mb-5 border-primary">
        <div class="card-header bg-primary text-white text-center py-4">
          <h4 class="mb-0 fw-bold">${title}</h4>
        </div>
        <div class="card-body bg-light fst-italic fs-5 lh-lg p-5">
          ${q.context}
        </div>
      </div>`;

      group.forEach((item) => {
        const gIdx = listQues.indexOf(item);
        html += generateQuestionHTML(item, gIdx, true);
      });
    }
    // === CÂU THƯỜNG (trắc nghiệm/tự luận) ===
    else {
      html += generateQuestionHTML(q, idx);
    }

    $("#list-question").html(html);
    initEssayEditorsInView();
    $(window).scrollTop(0);
  }

  // ==================== NÚT CHỌN ĐÁP ÁN ====================
  function createAnswerButtons(q, idx, chosenId, isReading = false) {
    const name = isReading ? `rdg-${idx}` : `mcq-${idx}`;
    return `
    <div class="text-center my-5">
      <div class="d-inline-block bg-light rounded-4 px-5 py-4 shadow-lg border">
        <div class="text-primary fw-bold mb-4 fs-5">Đáp án của bạn:</div>
        <div class="d-flex justify-content-center gap-4 flex-wrap">
          ${q.cautraloi
            .map((cau, i) => {
              const letter = String.fromCharCode(65 + i);
              const checked = String(chosenId) === String(cau.macautl);
              return `
            <div>
              <input type="radio" class="btn-check" name="${name}" id="opt-${
                cau.macautl
              }"
                     data-index="${idx}" data-macautl="${cau.macautl}" ${
                checked ? "checked" : ""
              }>
              <label for="opt-${
                cau.macautl
              }" class="btn rounded-pill fs-4 px-4 py-3 fw-bold shadow-sm
                     ${
                       checked ? "btn-warning text-dark" : "btn-outline-primary"
                     }">
                ${letter}
              </label>
            </div>`;
            })
            .join("")}
        </div>
      </div>
    </div>`;
  }

  // ==================== NÚT ĐIỀU HƯỚNG DƯỚI MÀN HÌNH ====================
  function updateNavigationButtons() {
    $(".one-mode-nav").remove();
    if (displayMode !== "one") return;

    const isFirst = currentQuestionIndex === 0;
    const isLast = currentQuestionIndex >= listQues.length - 1;

    const nav = `
    <div class="one-mode-nav position-fixed bottom-0 start-50 translate-middle-x bg-white shadow-sm border-top px-3 py-2"
         style="max-width: 420px; min-width: 300px; z-index: 1050; border-radius: 16px 16px 0 0">
      <div class="d-flex justify-content-between align-items-center">
        
        <button class="btn btn-outline-primary btn-sm px-4 ${
          isFirst ? "disabled" : ""
        }" 
                id="prev-btn">
          <i class="fas fa-chevron-left me-1"></i> Trước
        </button>

        <div class="fw-bold text-primary">
          <span class="fs-5">${currentQuestionIndex + 1}</span>
          <small class="text-muted">/${listQues.length}</small>
        </div>

        <button class="btn btn-outline-primary btn-sm px-4 ${
          isLast ? "disabled" : ""
        }" 
                id="next-btn">
          Sau <i class="fas fa-chevron-right ms-1"></i>
        </button>

      </div>
    </div>`;

    $("body").append(nav);
  }

  // ==================== SỰ KIỆN ====================
  // ==================== NÚT ĐIỀU HƯỚNG – ĐÃ SỬA HOÀN HẢO ====================
  $(document).on("click", "#prev-btn", () => {
    if (currentQuestionIndex <= 0) return;

    currentQuestionIndex--;

    const current = listQues[currentQuestionIndex];
    const nextQ = listQues[currentQuestionIndex + 1]; // câu vừa rời

    if (
      (nextQ?.loai === "reading" && current.loai !== "reading") ||
      nextQ?.context?.trim() !== current?.context?.trim()
    ) {
    }

    renderCurrentView();
  });

  $(document).on("click", "#next-btn", () => {
    if (currentQuestionIndex >= listQues.length - 1) return;

    currentQuestionIndex++;
    const current = listQues[currentQuestionIndex];
    const prevQ = listQues[currentQuestionIndex - 1];

    if (
      prevQ?.loai === "reading" &&
      (current.loai !== "reading" ||
        prevQ.context?.trim() !== current.context?.trim())
    ) {
      // Đã thoát nhóm → ok
    }

    renderCurrentView();
  });
  $(document).on("click", "#mode-full", () => switchDisplayMode("full"));
  $(document).on("click", "#mode-one", () => switchDisplayMode("one"));
  function getQuestion() {
    return $.ajax({
      type: "post",
      url: "/test/getQuestion",
      data: { made: made },
      dataType: "json",
      success: function (response) {
        if (response && Array.isArray(response) && response.length > 0) {
          questions = response;
        } else {
          $("#list-question").html(
            "<p class='text-center text-danger'>Không tải được câu hỏi!</p>"
          );
        }
      },
      error: function (xhr) {
        resolveQuestions(false);
        $("#list-question").html(
          "<p class='text-center text-danger'>Lỗi khi tải câu hỏi</p>"
        );
      },
    });
  }

  // ================== Khởi tạo listAnswer ==================
  function initListAnswer(questions) {
    return questions.map((q) => ({
      macauhoi: q.macauhoi,
      cautraloi: q.loai !== "essay" ? (q.dapanchon ?? 0) : null,
      noidungtl: q.loai === "essay" ? "" : null,
    }));
  }
  function initEssayEditorsInView() {
    $(".question").each(function () {
      const card = $(this);
      const idMatch = card.attr("id")?.match(/q-(\d+)/);
      if (!idMatch) return;
      const idx = parseInt(idMatch[1]) - 1;
      const q = listQues[idx];
      if (q.loai !== "essay") return;

      const container = card.find(`#essay-container-${idx}`);
      if (container.length === 0 || container.data("editor-initialized"))
        return;

      // Tạo HTML cho essay
      const userEssayText = window.examEssayHtml((answers[idx]?.noidungtl || "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"));
      const editorId = `editor_${idx + 1}`;
      const fileInputId = `fileinput_${idx + 1}`;
      const thumbId = `thumb_${idx + 1}`;

      container.html(`
      <div class="mb-4">
        <label class="form-label fw-bold text-dark fs-5">Trả lời của bạn:</label>
        <div id="${editorId}" class="border rounded bg-white p-3" style="min-height:280px">${userEssayText}</div>
      </div>
      <div class="border rounded p-4 bg-light">
        <label class="form-label fw-bold text-success mb-3">Hình ảnh (nếu có)</label>
        <input type="file" class="form-control" id="${fileInputId}" accept="image/*" multiple>
        <div id="${thumbId}" class="image-preview-container mt-3 d-flex flex-wrap gap-3 p-3 border rounded bg-white" style="min-height:120px">
          <small class="text-muted w-100 text-center">Chưa có ảnh nào được chọn</small>
        </div>
      </div>
    `);

      // Khởi tạo CKEditor
      setTimeout(() => {
        const fileInput = document.getElementById(fileInputId);
        const previewContainer = document.getElementById(thumbId);

        ClassicEditor.create(document.getElementById(editorId), {
          toolbar: [
            "heading",
            "|",
            "bold",
            "italic",
            "|",
            "bulletedList",
            "numberedList",
            "|",
            "insertTable",
            "blockQuote",
            "|",
            "undo",
            "redo",
          ],
          placeholder: "Nhập câu trả lời chi tiết của bạn tại đây...",
        })
          .then((editor) => {
            window["ckeditor_" + editorId] = editor;
            editor.ui.view.editable.element.style.minHeight = "280px";

            // Render ảnh cũ
            (async () => {
              const saved = await getImagesForQuestion(idx);
              if (saved.length > 0) {
                const tags = saved
                  .map(
                    (i) =>
                      `<p><img src="${i.base64}" style="max-width:100%;height:auto;display:block;margin:15px auto"></p>`
                  )
                  .join("");
                //setTimeout(() => editor.setData(editor.getData() + tags), 300);
              }
              await renderImages(idx);
            })();

            async function renderImages(qIndex) {
              const images = await getImagesForQuestion(qIndex);
              previewContainer.innerHTML =
                images.length === 0
                  ? `<small class="text-muted w-100 text-center">Chưa có ảnh nào được chọn</small>`
                  : "";
              images.forEach((imgObj) => {
                if (!imgObj.base64) return;
                const wrapper = document.createElement("div");
                wrapper.className = "position-relative";
                const img = document.createElement("img");
                img.src = imgObj.base64;
                img.className = "img-thumbnail rounded";
                img.style.cssText =
                  "max-height:140px; max-width:200px; object-fit:cover; cursor:pointer;";
                img.onclick = () => window.open(imgObj.base64, "_blank");
                const del = document.createElement("button");
                del.className =
                  "btn btn-danger btn-sm rounded-circle position-absolute";
                del.style.cssText =
                  "top:8px; right:8px; width:30px; height:30px;";
                del.innerHTML = "×";
                del.onclick = async (e) => {
                  e.stopPropagation();
                  await deleteImageFromDB(qIndex, imgObj.base64);
                  const temp = document.createElement("div");
                  temp.innerHTML = editor.getData();
                  temp.querySelectorAll("img").forEach((i) => {
                    if (i.src === imgObj.base64) i.parentElement?.remove();
                  });
                  editor.setData(temp.innerHTML);
                  await renderImages(qIndex);
                  saveAnswers();
                  await showBtnSideBar(listQues, answers);
                };
                wrapper.appendChild(img);
                wrapper.appendChild(del);
                previewContainer.appendChild(wrapper);
              });
            }

            editor.model.document.on("change:data", async () => {
              const text = editor
                .getData()
                .replace(/<[^>]*>/g, "")
                .trim();
              answers[idx] = answers[idx] || {};
              answers[idx].noidungtl = editor.getData();
              saveAnswers();
              const imgs = await getImagesForQuestion(idx);
              if (text || imgs.length > 0) {
                $(`.answer-item-link[data-target="q-${idx + 1}"]`).addClass(
                  "active"
                );
              }
              await showBtnSideBar(listQues, answers);
            });

            fileInput.addEventListener("change", trackImageChange(async (e) => {
              const files = Array.from(e.target.files);
              if (!files.length) return;
              const current = (await getImagesForQuestion(idx)).length;
              if (current + files.length > 12) {
                alert("Tối đa 12 ảnh mỗi câu!");
                return;
              }
              for (const file of files) {
                if (file.size > 20 * 1024 * 1024) {
                  alert(`${file.name} quá lớn (>20MB)`);
                  continue;
                }
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const compressed = await compressImage(ev.target.result);
                  // editor.setData(
                  //   editor.getData() +
                  //     `<p><img src="${compressed}" style="max-width:100%;height:auto;display:block;margin:15px auto"></p>`
                  // );
                  await saveImageToDB(idx, compressed);
                  await renderImages(idx);
                  saveAnswers();
                  await showBtnSideBar(listQues, answers);
                };
                trackImageRead(reader);
                reader.readAsDataURL(file);
              }
              fileInput.value = "";
            }));
          })
          .catch((err) => console.error("Lỗi CKEditor:", err));
      }, 100);

      container.data("editor-initialized", true);
    });
  }
  // ================== Render sidebar ==================
  // THAY TOÀN BỘ hàm showBtnSideBar bằng đoạn này:
  async function showBtnSideBar(questions, answers) {
    let html = "";

    for (const [i, q] of questions.entries()) {
      const ans = answers[i] || {};
      let isActive = "";

      if (q.loai === "essay") {
        const hasText = !!(
          ans.noidungtl &&
          ans.noidungtl.toString().trim().length > 0 &&
          ans.noidungtl !== "<p></p>" &&
          ans.noidungtl !== "<p><br></p>"
        );

        let hasImage = false;
        try {
          const images = await getImagesForQuestion(i);
          hasImage = images.length > 0;
        } catch (err) {
          console.warn("Lỗi kiểm tra ảnh câu " + (i + 1), err);
        }

        if (hasText || hasImage) {
          isActive = " active";
        }
      } else {
        // Trắc nghiệm
        if (ans.cautraloi && ans.cautraloi !== 0) {
          isActive = " active";
        }
      }

      const questionId =
        q.loai === "reading" ? `reading-q${i + 1}` : `c${i + 1}`;

      html += `<li class="answer-item p-1">
               <a href="javascript:void(0)" 
                  class="answer-item-link btn btn-outline-primary w-100 btn-sm${isActive}" 
                  data-target="${questionId}">${i + 1}</a>
             </li>`;
    }

    $(".answer").html(html);
  }
  // Click scroll
  $(document).on("click", ".answer-item-link", function () {
    const targetId = $(this).data("target");
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  });

  // ================== Render câu hỏi + CKEditor + MCQ ==================
  async function showListQuestion(questions, answers) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      $("#list-question").html(
        "<p class='text-center text-danger'>Không có câu hỏi</p>"
      );
      return;
    }

    answers = Array.isArray(answers) ? answers : [];
    let html = "";
    let currentContext = null;
    let groupHtml = "";
    const imageCache = new Map();

    // ==================== HÀM HIỂN THỊ ẢNH SIÊU ỔN ĐỊNH (Base64 → Blob URL) ====================

    const renderImage = (imgData) => {
      if (!imgData || imgData.trim() === "") return "";

      let src = imgData;
      if (src.match(/^\/9j\/|data:image\/|iVBORw0KGgo/)) {
        if (!imageCache.has(src)) {
          try {
            const binary = atob(src.includes(",") ? src.split(",")[1] : src);
            const array = Uint8Array.from(binary, (c) => c.charCodeAt(0));
            const blob = new Blob([array], { type: "image/jpeg" });
            const blobUrl = URL.createObjectURL(blob);
            imageCache.set(src, blobUrl);
          } catch (e) {
            console.warn("Lỗi decode base64 ảnh:", e);
            return `<div class="text-center text-danger my-3">Lỗi tải ảnh</div>`;
          }
        }
        src = imageCache.get(src);
      }

      return `
    <div class="text-center my-3">
      <img src="${src}" 
           class="img-fluid rounded shadow-sm border" 
           style="max-height: 320px; max-width: 100%; object-fit: contain; cursor: pointer"
           loading="lazy"
           onclick="window.open(this.src, '_blank')"
           onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIiBmaWxsPSIjOTk5Ij5M4buVaSB0YWkg4bqhbmg8L3RleHQ+PC9zdmc+'; this.onerror=null;">
    </div>`;
    };

    // Hàm tạo nút A B C D đẹp + có ảnh đáp án phía dưới nút
    const createAnswerButtons = (
      question,
      index,
      userChosenId,
      isReading = false
    ) => {
      const quesNum = index + 1;
      const groupName = isReading
        ? `options-reading-${quesNum}`
        : `options-c${quesNum}`;
      const idPrefix = isReading ? "rd" : "mcq";

      return `
      <div class="text-center my-5">
        <div class="d-inline-block bg-light rounded-4 px-5 py-4 border shadow-sm">
          <div class="text-primary fw-bold mb-4 fs-5">
            <i class="fas fa-edit me-2"></i>Đáp án của bạn:
          </div>
          <div class="d-flex justify-content-center gap-4 flex-wrap">
            ${question.cautraloi
              .map((ctl, i) => {
                const letter = String.fromCharCode(65 + i);
                const isChecked = String(userChosenId) === String(ctl.macautl);

                return `
                <div class="text-center">
                  <input type="radio" class="btn-check"
                         name="${groupName}"
                         id="${idPrefix}-${ctl.macautl}"
                         data-index="${index}"
                         data-macautl="${ctl.macautl}"
                         ${isChecked ? "checked" : ""}>
                  <label for="${idPrefix}-${ctl.macautl}"
                         class="btn rounded-pill fw-bold shadow-sm
                                ${
                                  isChecked
                                    ? "btn-warning text-dark"
                                    : "btn-outline-primary"
                                }"
                         style="min-width:52px; min-height:52px; font-size:1.4rem; padding:0.5rem 1rem">
                    ${letter}
                  </label>
                </div>`;
              })
              .join("")}
          </div>
        </div>
      </div>`;
    };

    questions.forEach((question, index) => {
      const userAnswer = answers[index] || {};
      const userChosenId = userAnswer.cautraloi || null;
      const userEssayText = window.examEssayHtml(userAnswer.noidungtl || "");
      const editorId = `editor_${index + 1}`;
      const thumbId = `thumb_${index + 1}`;
      const fileInputId = `fileinput_${index + 1}`;

      // ==================== READING GROUP ====================
      if (question.loai === "reading") {
        if ((question.context || "").trim() !== (currentContext || "").trim()) {
          if (groupHtml) {
            html += `<div class="reading-group card shadow-sm mb-4 overflow-hidden">${groupHtml}</div>`;
            groupHtml = "";
          }
          currentContext = (question.context || "").trim();
          groupHtml += question.tieude_context
            ? `<div class="bg-warning text-dark text-center py-3 fw-bold fs-5">${question.tieude_context}</div>`
            : "";
          groupHtml += `<div class="p-4 bg-light border-bottom">${question.context}</div>`;
        }

        const quesNum = index + 1;
        groupHtml += `
        <div class="p-4 bg-white" id="reading-q${quesNum}">
          <p class="fw-bold mb-3 fs-5"  style="
        display:inline-block;background:var(--color-chalk-canvas);color:var(--color-ink-charcoal);
        padding:6px 12px;
        border-radius:8px">${quesNum}. ${question.noidung}</p>
          ${renderImage(question.hinhanh)}`; // Ảnh câu hỏi

        if (question.cautraloi && question.cautraloi.length > 0) {
          groupHtml += `<div class="row g-3 mb-4">`;
          question.cautraloi.forEach((ctl, i) => {
            const content = ctl.noidungtl || ctl.content || "";
            const img = ctl.hinhanhtl || ctl.hinhanh || "";
            groupHtml += `
<div class="col-12 col-md-6">
  <div class="border border-2 rounded-4 p-4 bg-white shadow-sm h-100 d-flex flex-column transition-all hover-shadow-lg"
       style="border-color: var(--color-mist-border) !important; min-height: 120px">
    <div class="d-flex align-items-center gap-4 flex-grow-1">
      <!-- Badge A B C D tròn, căn giữa tuyệt đối -->
      <div class="flex-shrink-0 d-flex align-items-center justify-content-center rounded-circle bg-primary text-white fw-bold fs-4 shadow"
           style="width: 52px; height: 52px; min-width: 52px">
        ${String.fromCharCode(65 + i)}
      </div>
      
      <!-- Nội dung + ảnh -->
      <div class="flex-grow-1">
        <div class="mb-3 lh-base text-dark" style="font-size: 1.05rem">
          ${content}
        </div>
        ${renderImage(img)}
      </div>
    </div>
  </div>
</div>`;
          });
          groupHtml += `</div>`;

          groupHtml += createAnswerButtons(question, index, userChosenId, true);
        }
        groupHtml += `</div>`;
      }

      // ==================== CÂU HỎI THƯỜNG ====================
      else {
        if (groupHtml) {
          html += `<div class="reading-group card shadow-sm mb-4 overflow-hidden">${groupHtml}</div>`;
          groupHtml = "";
          currentContext = null;
        }

        html += `
        <div class="question card shadow-sm mb-4 overflow-hidden" id="c${
          index + 1
        }">
          <div class="card-body p-4">
         <h5 class="card-title fw-bold mb-3"
    style="
        display:inline-block;background:var(--color-chalk-canvas);color:var(--color-ink-charcoal);
        padding:6px 12px;
        border-radius:8px">
  ${index + 1}. ${question.noidung}
</h5>


            ${renderImage(question.hinhanh)}`;

        // ==================== ESSAY ====================
        if (question.loai === "essay") {
          html += `
          <div class="mb-4">
            <label class="form-label fw-bold text-dark fs-5">Trả lời của bạn:</label>
            <div id="${editorId}" class="border rounded bg-white p-3" style="min-height:280px">${userEssayText}</div>
          </div>
          <div class="border rounded p-4 bg-light">
            <label class="form-label fw-bold text-success mb-3">Hình ảnh (nếu có)</label>
            <input type="file" class="form-control" id="${fileInputId}" accept="image/*" multiple>
            <div id="${thumbId}" class="image-preview-container mt-3 d-flex flex-wrap gap-3 p-3 border rounded bg-white" style="min-height:120px">
              <small class="text-muted w-100 text-center">Chưa có ảnh nào được chọn</small>
            </div>
          </div>
        </div></div>`;

          // CKEditor + xử lý ảnh (giữ nguyên 100% logic cũ)
          setTimeout(() => {
            const fileInput = document.getElementById(fileInputId);
            const previewContainer = document.getElementById(thumbId);

            if (window["ckeditor_" + editorId]) {
              window["ckeditor_" + editorId].destroy().catch(() => {});
            }

            ClassicEditor.create(document.getElementById(editorId), {
              toolbar: [
                "heading",
                "|",
                "bold",
                "italic",
                "|",
                "bulletedList",
                "numberedList",
                "|",
                "insertTable",
                "blockQuote",
                "|",
                "undo",
                "redo",
              ],
              placeholder: "Nhập câu trả lời chi tiết của bạn tại đây...",
            }).then((editor) => {
              window["ckeditor_" + editorId] = editor;
              editor.ui.view.editable.element.style.minHeight = "280px";
              if (userEssayText) editor.setData(userEssayText);

              async function renderImages(qIndex) {
                try {
                  const images = await getImagesForQuestion(qIndex);
                  previewContainer.innerHTML =
                    images.length === 0
                      ? `<small class="text-muted w-100 text-center">Chưa có ảnh nào được chọn</small>`
                      : "";
                  images.forEach((imgObj) => {
                    if (!imgObj.base64) return;
                    const wrapper = document.createElement("div");
                    wrapper.className = "position-relative";
                    const img = document.createElement("img");
                    img.src = imgObj.base64;
                    img.className = "img-thumbnail rounded";
                    img.style.cssText =
                      "max-height:140px; max-width:200px; object-fit:cover; cursor:pointer;";
                    img.onclick = () => window.open(imgObj.base64, "_blank");
                    const del = document.createElement("button");
                    del.className =
                      "btn btn-danger btn-sm rounded-circle position-absolute";
                    del.style.cssText =
                      "top:8px; right:8px; width:30px; height:30px;";
                    del.innerHTML = "×";
                    del.onclick = async (e) => {
                      e.stopPropagation();
                      await deleteImageFromDB(qIndex, imgObj.base64);
                      const temp = document.createElement("div");
                      temp.innerHTML = editor.getData();
                      temp.querySelectorAll("img").forEach((i) => {
                        if (i.src === imgObj.base64) i.parentElement?.remove();
                      });
                      editor.setData(temp.innerHTML);
                      await renderImages(qIndex);
                      saveAnswers();
                      await showBtnSideBar(questions, answers);
                    };
                    wrapper.appendChild(img);
                    wrapper.appendChild(del);
                    previewContainer.appendChild(wrapper);
                  });
                } catch (err) {
                  console.error(err);
                }
              }

              editor.model.document.on("change:data", async () => {
                const text = editor
                  .getData()
                  .replace(/<[^>]*>/g, "")
                  .trim();
                answers[index] = answers[index] || {};
                answers[index].noidungtl = editor.getData();
                saveAnswers();
                const imgs = await getImagesForQuestion(index);
                if (text || imgs.length > 0) {
                  $(`.answer-item-link[data-target="c${index + 1}"]`).addClass(
                    "active"
                  );
                }
                await showBtnSideBar(questions, answers);
              });

              fileInput.addEventListener("change", trackImageChange(async (e) => {
                const files = Array.from(e.target.files);
                if (!files.length) return;
                const current = (await getImagesForQuestion(index)).length;
                if (current + files.length > 12) {
                  alert("Tối đa 12 ảnh mỗi câu!");
                  return;
                }
                for (const file of files) {
                  if (file.size > 20 * 1024 * 1024) {
                    alert(`${file.name} quá lớn (>20MB)`);
                    continue;
                  }
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const compressed = await compressImage(ev.target.result);
                    // editor.setData(
                    //   editor.getData() +
                    //     `<p><img src="${compressed}" style="max-width:100%;height:auto;display:block;margin:15px auto"></p>`
                    // );
                    await saveImageToDB(index, compressed);
                    await renderImages(index);
                    saveAnswers();
                    await showBtnSideBar(questions, answers);
                  };
                  trackImageRead(reader);
                  reader.readAsDataURL(file);
                }
                fileInput.value = "";
              }));

              (async () => {
                const saved = await getImagesForQuestion(index);
                if (saved.length > 0) {
                  const tags = saved
                    .map(
                      (i) =>
                        `<p><img src="${i.base64}" style="max-width:100%;height:auto;display:block;margin:15px auto"></p>`
                    )
                    .join("");
                  setTimeout(
                    //() => editor.setData(editor.getData() + tags),
                    300
                  );
                }
                await renderImages(index);
              })();
            });
          }, 100);
        }

        // ==================== MCQ THƯỜNG ====================
        else {
          if (question.cautraloi && question.cautraloi.length > 0) {
            html += `<div class="row g-3 mb-4">`;
            question.cautraloi.forEach((ctl, i) => {
              const content = ctl.noidungtl || "";
              const img = ctl.hinhanhtl || ctl.hinhanh || "";
              html += `
              <div class="col-12 col-md-6">
  <div class="border border-2 rounded-4 p-4 bg-white shadow-sm h-100 d-flex flex-column transition-all hover-shadow-lg"
       style="border-color: var(--color-mist-border) !important; min-height: 120px">
    <div class="d-flex align-items-center gap-4 flex-grow-1">
      <!-- Badge A B C D tròn, căn giữa tuyệt đối -->
      <div class="flex-shrink-0 d-flex align-items-center justify-content-center rounded-circle bg-primary text-white fw-bold fs-4 shadow"
           style="width: 52px; height: 52px; min-width: 52px">
        ${String.fromCharCode(65 + i)}
      </div>
      
      <!-- Nội dung + ảnh -->
      <div class="flex-grow-1">
        <div class="mb-3 lh-base text-dark" style="font-size: 1.05rem">
          ${content}
        </div>
        ${renderImage(img)}
      </div>
    </div>
  </div>
</div>`;
            });
            html += `</div>`;

            html += createAnswerButtons(question, index, userChosenId, false);
          }
          html += `</div></div>`;
        }
      }
    });

    if (groupHtml) {
      html += `<div class="reading-group card shadow-sm mb-4 overflow-hidden">${groupHtml}</div>`;
    }

    $("#list-question").html(html);

    // Event chọn đáp án
    $(document)
      .off("change", ".btn-check")
      .on("change", ".btn-check", async function () {
        const idx = $(this).data("index");
        const macautl = $(this).data("macautl");

        answers[idx] = answers[idx] || {};
        answers[idx].cautraloi = macautl;
        saveAnswers();
        await showBtnSideBar(questions, answers);

        const name = $(this).attr("name");
        $(`input[name="${name}"]`).each(function () {
          const label = $(`label[for="${$(this).attr("id")}"]`);
          if ($(this).is(":checked")) {
            label
              .removeClass("btn-outline-primary")
              .addClass("btn-warning text-dark");
          } else {
            label
              .removeClass("btn-warning text-dark")
              .addClass("btn-outline-primary");
          }
        });

        const labelText = $(`label[for="${$(this).attr("id")}"]`).text();
        showAnswerToast(idx + 1, labelText);
      });

    await showBtnSideBar(questions, answers);
  }

  // Hàm lưu localStorage (giữ nguyên)
  function saveAnswers() {
    const data = answers.map((ans) => ({
      macauhoi: ans.macauhoi,
      imagesByQuestionId: true,
      cautraloi: ans.cautraloi ?? 0,
      noidungtl: ans.noidungtl ?? null,
    }));
    localStorage.setItem(answerKey, JSON.stringify(data));
  }
  // ================= Khởi tạo và render lần đầu =================
  $.when(getQuestion()).done(async (response) => {
    if (!response || !response.cauhoi) {
      resolveQuestions(false);
      $("#list-question").html(
        "<p class='text-center text-danger'>Không tải được đề thi!</p>"
      );
      return;
    }

    // Đổ tên môn + tên đề thi vào thanh nav
    if (response.dethi) {
      $("#ten-mon").text(response.dethi.tenmonhoc || "Không rõ");
      $("#ten-de").text(response.dethi.tende || "Không rõ");
    }

    // Gán dữ liệu câu hỏi
    questions = response.cauhoi;
    listQues = questions.map((q, i) => ({ ...q, displayOrder: i + 1 }));

    // Khởi tạo mảng đáp án
    let savedAnswers = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(answerKey) || "[]");
      if (Array.isArray(parsed)) savedAnswers = parsed;
    } catch (error) {
      console.warn("Nháp không hợp lệ, khôi phục dữ liệu từ đề thi", error);
    }
    try {
      await migrateLegacyImages(savedAnswers);
    } catch (error) {
      console.warn("Chưa khôi phục được ảnh nháp cũ, giữ nguyên dữ liệu", error);
    }
    if (savedAnswers.length) {
      answers = listQues.map((q) => {
        // tìm đáp án đã lưu dựa trên macauhoi
        const saved = savedAnswers.find((s) => s && s.macauhoi === q.macauhoi);
        return {
          macauhoi: q.macauhoi,
          cautraloi: saved?.cautraloi ?? (q.loai === "essay" ? null : (q.dapanchon ?? 0)),
          noidungtl: saved?.noidungtl ?? (q.loai === "essay" ? "" : null),
        };
      });
    } else {
      answers = initListAnswer(listQues);
    }

    // Hàm lưu đáp án khi user chọn/nhập
    function saveAnswers() {
      localStorage.setItem(
        answerKey,
        JSON.stringify(
          answers.map((ans) => ({
            macauhoi: ans.macauhoi,
            imagesByQuestionId: true,
            cautraloi: ans.cautraloi,
            noidungtl: ans.noidungtl,
          }))
        )
      );
    }

    // Render giao diện
    renderCurrentView();
    await showBtnSideBar(listQues, answers);
    resolveQuestions(true);

    // Highlight câu hiện tại (chế độ 1 câu)
    if (displayMode === "one") {
      const currentQ = listQues[currentQuestionIndex];
      let target = "";
      if (currentQ.loai === "reading") {
        target = `reading-q${currentQuestionIndex + 1}`;
      } else {
        target = `c${currentQuestionIndex + 1}`;
      }
      $(`.answer-item-link[data-target="${target}"]`).addClass(
        "btn-primary text-white"
      );
    }

    // Bắt sự kiện thay đổi đáp án
    $(document).on(
      "change",
      ".answer-item input, .answer-item textarea, .answer-item select",
      function () {
        const $item = $(this).closest(".answer-item");
        const macauhoi = $item.data("macauhoi");
        const type = $item.data("loai");

        let index = answers.findIndex((a) => a.macauhoi === macauhoi);
        if (index === -1) return;

        if (type === "essay") {
          answers[index].noidungtl = $(this).val();
        } else {
          answers[index].cautraloi = $(this).val();
        }

        saveAnswers();
      }
    );
  });

  // === CLICK VÀO SỐ CÂU Ở SIDEBAR → NHẢY ĐÚNG CÂU Ở CẢ 2 CHẾ ĐỘ ===
  $(document).on("click", ".answer-item-link", function (e) {
    e.preventDefault();

    const target = $(this).data("target");
    let questionIndex = -1;

    if (target.startsWith("reading-q")) {
      questionIndex = parseInt(target.replace("reading-q", "")) - 1;
    } else if (target.startsWith("c")) {
      questionIndex = parseInt(target.replace("c", "")) - 1;
    }

    if (questionIndex >= 0 && questionIndex < listQues.length) {
      currentQuestionIndex = questionIndex;

      if (displayMode === "full") {
        const el = document.getElementById(target);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else {
        renderCurrentView();
      }
      $(".answer-item-link").removeClass("btn-primary text-white");
      $(this).addClass("btn-primary text-white");
    }
  });

  $(document).on("click", ".btn-answer", function () {
    const forId = $(this).attr("for");
    const $input = $("#" + forId);
    if ($input.length) {
      $input.prop("checked", true).trigger("change");
    }
  });

  function showAnswerToast(cau, dapan) {
    $("#answer-toast").remove();
    const toastHtml = `
    <div id="answer-toast" class="position-fixed top-0 start-50 translate-middle-x p-3" style="z-index: 9999; margin-top: 20px">
      <div class="toast show align-items-center text-white bg-success border-0 shadow-lg" role="alert">
        <div class="d-flex">
          <div class="toast-body fw-bold fs-5 text-center">
           Bạn đã chọn: <span class="text-warning">Câu ${cau}</span> → Đáp án <span class="text-warning fs-4">${dapan}</span>
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" onclick="$('#answer-toast').fadeOut(200, function(){$(this).remove()})"></button>
        </div>
      </div>
    </div>
  `;

    $("body").append(toastHtml);

    setTimeout(() => {
      $("#answer-toast").fadeOut(200, function () {
        $(this).remove();
      });
    }, 1500);
  }
  // XÓA DỮ LIỆU
  function clearExamData() {
    localStorage.removeItem(answerKey);
    localStorage.removeItem(dethiKey);
    localStorage.removeItem("isTabSwitched_" + made);
  }

  $("#btn-nop-bai").click(async function (e) {
    e.preventDefault();

    const unanswered = [];

    for (let i = 0; i < listQues.length; i++) {
      const q = listQues[i];
      const ans = answers[i] || {};

      if (q.loai === "essay") {
        // Kiểm tra nội dung text
        const hasText = !!(
          ans.noidungtl &&
          typeof ans.noidungtl === "string" &&
          ans.noidungtl.replace(/<[^>]*>/g, "").trim().length > 0
        );

        // Kiểm tra ảnh
        let hasImage = false;
        try {
          const images = await getImagesForQuestion(i);
          hasImage = images.length > 0;
        } catch (e) {}

        if (!hasText && !hasImage) {
          unanswered.push(i + 1);
        }
      } else {
        // Trắc nghiệm: kiểm tra có chọn đáp án khác 0 không
        if (!ans.cautraloi || ans.cautraloi === 0) {
          unanswered.push(i + 1);
        }
      }
    }

    if (unanswered.length > 0 && !timeExpired && !tabViolation) {
      Swal.fire({
        icon: "warning",
        title: "Chưa hoàn thành!",
        html: `<p class='fs-6 text-center mb-0'>Bạn chưa trả lời <strong>${
          unanswered.length
        }</strong> câu:<br>
            <span class="text-danger fw-bold fs-5">${unanswered.join(
              ", "
            )}</span></p>`,
        confirmButtonText: "OK",
      });
      return false;
    }

    // Nếu không còn lỗi → hỏi xác nhận nộp
    Swal.fire({
      title:
        "<center><p class='fs-3 mb-0'>Bạn có chắc chắn muốn nộp bài?</p></center>",
      html: "<p class='text-muted fs-6 text-center mb-0'>Khi xác nhận nộp bài, bạn sẽ không thể sửa lại!</p>",
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Vâng, chắc chắn!",
      cancelButtonText: "Huỷ",
    }).then((result) => {
      if (result.isConfirmed) {
        nopbai();
      }
    });
  });

  async function nopbai() {
    if (submitting || submitted) return;
    submitting = true;
    $("#btn-nop-bai").prop("disabled", true);
    $("input[type=file]").prop("disabled", true);
    try {
    if (!(await questionsReady) || !listQues.length) throw new Error("Chưa tải được đề thi. Nháp vẫn được giữ lại.");
    while (pendingImageReads.size) await Promise.all([...pendingImageReads]);
    const formData = new FormData();
    const savedAnswers = answers.map((ans, i) => ({
      macauhoi: listQues[i].macauhoi,
      cautraloi: ans.cautraloi ?? 0,
      noidungtl: ans.noidungtl ?? "",
    }));

    formData.append("made", made);
    formData.append("thoigian", new Date().toISOString());

    // ==== TRẮC NGHIỆM + READING (LOẠI TRỪ ESSAY) ====
    const tracnghiem = [];
    for (let i = 0; i < listQues.length; i++) {
      const q = listQues[i];
      if (q.loai === "essay") continue;

      const savedAns = savedAnswers[i] || {};
      tracnghiem.push({
        macauhoi: q.macauhoi,
        thutu: q.displayOrder || i + 1, // Dùng displayOrder thay vì thutu DB
        cautraloi: savedAns.cautraloi || 0,
      });
    }

    formData.append("listCauTraLoi", JSON.stringify(tracnghiem));

    // ==== TỰ LUẬN + ẢNH ====
    for (let i = 0; i < listQues.length; i++) {
      const q = listQues[i];
      if (q.loai !== "essay") continue;

      const ans = savedAnswers[i] || {};
      const text = (ans.noidungtl || "").trim();
      let images = [];

      try {
        images = await getImagesForQuestion(i);
      } catch (err) {}

      if (images.length > 0 || text) {
        formData.append(`essay_${i}_exists`, "1");
        formData.append(`essay_${i}_macauhoi`, q.macauhoi);
        formData.append(`essay_${i}_thutu`, q.displayOrder || i + 1);
        formData.append(`essay_${i}_noidung`, text || "");

        images.forEach((imgObj, j) => {
          if (imgObj?.base64) {
            const pure = imgObj.base64.includes(",")
              ? imgObj.base64.split(",")[1]
              : imgObj.base64;
            if (pure && pure.length > 100) {
              formData.append(`essay_${i}_image_${j}`, pure);
            }
          }
        });
      }
    }

    // ==== LOG + XÁC NHẬN ====
    // console.clear();
    // console.log(
    //   "%c DỮ LIỆU SẮP GỬI ĐI KHI NỘP BÀI",
    //   "font-size:18px;color:#e91e63;font-weight:bold"
    // );
    // console.table(
    //   tracnghiem.map((x, idx) => ({
    //     STT: idx + 1,
    //     macauhoi: x.macauhoi,
    //     thutu: x.thutu,
    //     cautraloi: x.cautraloi,
    //     "Đúng/Sai": x.cautraloi === 0 ? "Chưa chọn" : "Đã chọn",
    //   }))
    // );

    // // ==== XÁC NHẬN GỬI ====
    // const confirmSend = await Swal.fire({
    //   title: "XEM DỮ LIỆU GỬI ĐI",
    //   html: `<p>Đã in dữ liệu ra Console (F12)</p>
    //        <p class="text-success">listCauTraLoi có <strong>${tracnghiem.length}</strong> câu</p>
    //        <p>Bạn có muốn <strong>gửi thật</strong> không?</p>`,
    //   icon: "question",
    //   showCancelButton: true,
    //   confirmButtonText: "Gửi thật",
    //   cancelButtonText: "Chỉ xem thôi",
    //   allowOutsideClick: false,
    //   allowEscapeKey: false,
    // });

    // if (!confirmSend.isConfirmed) {
    //   Swal.fire("Đã hủy", "Không gửi bài. Bạn có thể kiểm tra lại.", "info");
    //   return;
    // }

    // ==== GỬI LÊN SERVER ====
      const res = await fetch("/test/submit", {
        method: "POST",
        body: formData,
      }).then((r) => r.json());
      if (res.success) {
        submitted = true;
        try { await clearImagesForExam(); } catch (error) { console.warn("Bài đã nộp, chưa dọn được ảnh nháp", error); }
        try { clearExamData(); } catch (error) { console.warn("Bài đã nộp, chưa dọn được nháp", error); }
        Swal.fire("Thành công!", "Bài thi đã được nộp.", "success").then(() => {
          location.href = `/test/start/${made}`;
        });
      } else {
        throw new Error(res.message || "Lỗi server");
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Lỗi!", "Không thể nộp bài: " + err.message, "error");
    } finally {
      submitting = false;
      if (!submitted) {
        $("#btn-nop-bai").prop("disabled", false);
        $("input[type=file]").prop("disabled", false);
      }
    }
  }

  $("#btn-thoat").click(function (e) {
    e.preventDefault();
    Swal.fire({
      title: "Bạn có chắc muốn thoát?",
      html: "<p class='text-muted fs-6 text-center mb-0'>Khi xác nhận thoát, bạn sẽ không được tiếp tục làm bài ở lần thi này. Kết quả bài làm vẫn sẽ được nộp</p>",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Vâng, chắc chắn!",
      cancelButtonText: "Huỷ",
    }).then((result) => {
      if (result.isConfirmed) {
        nopbai(() => {
          window.location.href = "/dashboard";
        });
      }
    });
  });

  var endTime = -1;
  let clockRetries = 0;
  getTimeTest();

  function retryClock() {
    $("#timer").text("Đang đồng bộ thời gian...");
    if (++clockRetries <= 3) setTimeout(getTimeTest, 1000);
    else $("#timer").text("Không tải được giờ thi. Vui lòng tải lại trang.");
  }

  function getTimeTest() {
    let dethi = $("#dethicontent").data("id");
    $.ajax({
      type: "post",
      url: "/test/getTimeTest",
      data: {
        dethi: dethi,
      },
      success: function (response) {
        endTime = response ? new Date(response).getTime() : NaN;
        if (!Number.isFinite(endTime)) { retryClock(); return; }
        clockRetries = 0;
          $.ajax({
            type: "post",
            url: "/test/getTimeEndTest",
            data: {
              dethi: dethi,
            },
            success: function (responseEnd) {
              let endTimeTest = responseEnd ? new Date(responseEnd).getTime() : NaN;
              if (Number.isFinite(endTimeTest) && endTimeTest < endTime) {
                endTime = endTimeTest;
              }
              countDown();
            },
            error: function () { countDown(); },
          });
      },
      error: retryClock,
    });
  }

  function countDown() {
    const update = function () {
      var now = new Date().getTime();
      var distance = Math.max(0, endTime - now);
      var hours = Math.floor(
        (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      if (hours < 10) hours = "0" + hours;
      var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      if (minutes < 10) minutes = "0" + minutes;
      var seconds = Math.floor((distance % (1000 * 60)) / 1000);
      if (seconds < 10) seconds = "0" + seconds;
      $("#timer").html(hours + ":" + minutes + ":" + seconds);

      if (distance <= 30000) {
        $("#timer").css("color", "red").css("font-weight", "bold");
      }

      if (endTime <= now) {
        timeExpired = true;
        // Thay vì chỉ gọi nopbai(), bạn có thể thêm thông báo trước
        clearInterval(x);

        nopbai();
      }
    };
    var x = setInterval(update, 1000);
    update();
  }

  // Logic xử lý chuyển tab
  // ==================== CHỐNG CHUYỂN TAB - XỬ LÝ TRIỆT ĐỂ VỚI UPLOAD FILE ====================
  let isSelectingFile = false;
  let tabSwitchCount = parseInt(
    localStorage.getItem("isTabSwitched_" + made) || "0",
    10
  );
  let hasWarned = false;
  let isAway = false;

  // Khi click vào input file → set flag true (bắt đầu quá trình chọn file)
  $(document).on("click", "input[type=file]", function () {
    isSelectingFile = true;
  });

  // Khi chọn file thành công → reset flag sau khi xử lý
  $(document).on("change", "input[type=file]", function () {
    // Logic upload file ở đây (đã có trong code)
    isSelectingFile = false;
  });

  // Khi window focus lại (ví dụ: sau khi cancel dialog hoặc quay lại tab)
  $(window).on("focus", function () {
    if (isSelectingFile) {
      isSelectingFile = false; // Reset nếu đang ở trạng thái chọn file (xử lý cancel hoặc focus back mà không change)
    }
    if (document.visibilityState !== "hidden") isAway = false;
  });

  // Blur và visibilitychange có thể cùng phát sinh cho một lần rời bài.
  function handleExamLeave() {
    if (isSelectingFile || isAway || submitted) return;
    isAway = true;

    // Đây là chuyển tab thật
    tabSwitchCount++;

    $.ajax({
      type: "post",
      url: "/test/chuyentab",
      data: { made: $("#dethicontent").data("id") },
      timeout: 6000,
    })
      .done(function (res) {
        if (res == 1) {
          tabViolation = true;
          if (!hasWarned) {
            hasWarned = true;
            Swal.fire({
              icon: "error",
              title: "Phát hiện rời khỏi bài thi!",
              text: "Hệ thống tự động nộp bài vì bạn đã rời khỏi cửa sổ thi.",
              allowOutsideClick: false,
              allowEscapeKey: false,
              confirmButtonText: "OK",
            });
          }
          // Quy chế của giáo viên có hiệu lực ngay, không chờ SV xác nhận.
          nopbai();
        } else {
          localStorage.setItem("isTabSwitched_" + made, tabSwitchCount);
          Swal.fire({
            icon: "warning",
            title: "Cảnh báo",
            html: "Bạn đã rời khỏi cửa sổ bài thi.",
            confirmButtonText: "Tôi hiểu",
          });
        }
      })
      .fail(function () {
        localStorage.setItem("isTabSwitched_" + made, tabSwitchCount);
      });
  }
  $(window).on("blur", handleExamLeave);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") handleExamLeave();
    else isAway = false;
  });

  //
  // Xóa dữ liệu khi rời khỏi trang
  // window.addEventListener("beforeunload", function () {
  //   localStorage.removeItem(answerKey);
  //   localStorage.removeItem(dethiKey);
  //   localStorage.removeItem("isTabSwitched_" + made);
  // });

  //chặn load trang
  // $(document).on("keydown", function (e) {
  //   if (
  //     e.which === 116 || // F5
  //     ((e.ctrlKey || e.metaKey) && e.which === 82) // Ctrl+R / Cmd+R
  //   ) {
  //     e.preventDefault();

  //     Swal.fire({
  //       icon: "warning",
  //       title: "Không thể tải lại!",
  //       html: `<p class='fs-6 text-center mb-0'>Bạn không thể tải lại trang khi đang làm bài.</p>`,
  //       confirmButtonText: "OK",
  //     });
  //   }
  // });

  // history.pushState(null, null, location.href);
  // window.onpopstate = function () {
  //   history.go(1);

  //   Swal.fire({
  //     icon: "warning",
  //     title: "Không thể quay lại!",
  //     html: `<p class='fs-6 text-center mb-0'>Bạn không thể quay lại trang trước khi hoàn thành bài thi.</p>`,
  //     confirmButtonText: "OK",
  //   });
  // };
  // window.addEventListener("beforeunload", function (e) {
  //   // Kiểm tra xem bài chưa hoàn thành
  //   const answers = JSON.parse(localStorage.getItem(answerKey) || "[]");
  //   const unanswered = answers.filter((ans, i) => {
  //     const q = questions[i];
  //     if (q.loai === "essay") return !ans.noidungtl?.trim();
  //     return ans.cautraloi === 0;
  //   });

  //   if (unanswered.length > 0) {
  //     Swal.fire({
  //       icon: "warning",
  //       title: "Bài chưa hoàn thành!",
  //       html: `<p class='fs-6 text-center mb-0'>Bạn chưa hoàn thành <strong>${unanswered.length}</strong> câu hỏi.<br>Vui lòng hoàn thành trước khi rời trang.</p>`,
  //       confirmButtonText: "OK",
  //     });

  //     e.preventDefault();
  //     e.returnValue = ""; // Chrome hiện cảnh báo mặc định
  //     return "";
  //   }
  // });
  // Giữ cleanup trong cùng scope với cache ảnh của lượt thi.
  window.addEventListener("beforeunload", () => {
    imageCache.forEach((url) => URL.revokeObjectURL(url));
    imageCache.clear();
  });
});
