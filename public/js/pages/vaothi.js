$(document).ready(function () {
  $("#start-test").click(function (e) {
    let made = $(this).data("id");
    e.preventDefault();
    $.ajax({
      type: "post",
      url: "/test/startTest",
      data: {
        made: made,
      },
      dataType: "json",
      success: function (response) {
        if (response) {
          location.href = `/test/taketest/${made}`;
        } else {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message: "Có lỗi gì đó xảy ra!",
          });
        }
      },
    });
  });

  $(document).on("click", "#show-exam-detail", function () {
    $("#modal-show-test").modal("show");
    let makq = $(this).data("id");
    $.ajax({
      type: "post",
      url: "/test/getResultDetail",
      data: {
        makq: makq,
      },
      dataType: "json",
      success: function (response) {
        // The server returns { success: true, data: [...] }.
        // Accept either the wrapped form or a raw array for backward-compatibility.
        let questions = response;
        console.debug("getResultDetail raw response:", response);
        try {
          if (
            response &&
            typeof response === "object" &&
            response.hasOwnProperty("data")
          ) {
            questions = response.data;
          }
        } catch (err) {
          console.error(
            "Error while parsing getResultDetail response",
            err,
            response
          );
        }

        // If server returned an object (associative) instead of an array, coerce to array
        if (
          !Array.isArray(questions) &&
          questions &&
          typeof questions === "object"
        ) {
          questions = Object.values(questions);
        }

        if (!Array.isArray(questions)) {
          console.error(
            "getResultDetail returned unexpected payload, expected array of questions",
            response
          );
          $("#content-file").html(
            '<div class="alert alert-warning">Không có chi tiết bài làm để hiển thị.</div>'
          );
          return;
        }

        showTestDetail(questions);
      },
    });
  });

  function showTestDetail(questions) {
    // questions = questions.sort(
    //   (a, b) => parseInt(a.macauhoi) - parseInt(b.macauhoi)
    // );
    let html = "";
    let lastContext = null;
    let inGroup = false;

    questions.forEach((item, index) => {
      const correctOp = item.cautraloi?.find((op) => op.ladapan == 1);
      const hasAnswerKey = item.cautraloi?.some((op) => op.ladapan !== undefined && op.ladapan !== null);
      const selectedOp = item.cautraloi?.find(
        (op) => op.macautl === item.dapanchon
      );
      const isCorrect =
        selectedOp && correctOp && selectedOp.macautl === correctOp.macautl;
      const isWrong = hasAnswerKey && selectedOp && !isCorrect;
      const notAnswered = !item.dapanchon;

      const normalizedContext = item.context
        ? item.context.replace(/\s+/g, " ").trim()
        : null;

      // Close group if switching to non-reading
      if (item.loai !== "reading" && inGroup) {
        html += `</div></div>`;
        inGroup = false;
      }

      // === READING CONTEXT ===
      if (
        item.loai === "reading" &&
        normalizedContext &&
        normalizedContext !== lastContext
      ) {
        // Close previous group if open
        if (inGroup) {
          html += `</div></div>`;
        }

        html += `
        <div class="card mb-5 border-0 shadow rounded-4 overflow-hidden">
          <div class="card-body p-4 p-md-5">
            <div class="bg-light rounded-3 p-3">
              <h6 class="text-primary fw-bold mb-2">
                <i class="fas fa-book-open me-2"></i>${
                  item.tieude_context || "Đoạn văn"
                }
              </h6>
              <p class="text-muted small lh-lg mb-0">${item.context}</p>
            </div>
            <hr class="my-4">`;
        lastContext = normalizedContext;
        inGroup = true;
      }

      if (!inGroup) {
        html += `
        <div class="card mb-5 border-0 shadow rounded-4 overflow-hidden">
          <div class="card-body p-4 p-md-5">
            <h5 class="fw-bold text-dark mb-4">${index + 1}. ${
          item.noidung
        }</h5>`;
      } else {
        html += `
        <div class="question-item mb-5">
          <h5 class="fw-bold text-dark mb-4">${index + 1}. ${
          item.noidung
        }</h5>`;
      }

      if (
        item.loai === "essay" ||
        (typeof isReadingEssay === "function" && isReadingEssay(item))
      ) {
        html += renderEssayAnswer(item);
        if (!inGroup) {
          html += `</div></div>`;
        } else {
          html += `</div>`;
        }
        return;
      }

      html += `<div class="row g-4">`;
      item.cautraloi?.forEach((op, i) => {
        const label = String.fromCharCode(65 + i);
        const isSelected = op.macautl === item.dapanchon;
        const isCorrectAnswer = op.ladapan == 1;

        let borderClass = "border-2 border-light";
        let icon = "";

        if (isSelected && isCorrect) {
          borderClass = "border-success border-4 shadow-sm";
          icon = `<i class="fas fa-check-circle fa-2x text-success position-absolute end-0 top-50 translate-middle-y me-3"></i>`;
        } else if (isSelected && isWrong) {
          borderClass = "border-danger border-4 shadow-sm";
          icon = `<i class="fas fa-times-circle fa-2x text-danger position-absolute end-0 top-50 translate-middle-y me-3"></i>`;
        } else if (!isSelected && isCorrectAnswer && isWrong) {
          borderClass = "border-success border-4 shadow-sm";
          icon = `<i class="fas fa-check-circle fa-2x text-success position-absolute end-0 top-50 translate-middle-y me-3"></i>`;
        }

        const content = op.hinhanh?.trim()
          ? `<img src="${op.hinhanh}" class="img-fluid rounded-3" style="max-height:110px">`
          : op.noidungtl;

        html += `
        <div class="col-12 col-md-6">
          <div class="position-relative rounded-4 ${borderClass} bg-white" style="min-height:90px">
            <div class="p-4 d-flex align-items-center h-100">
              <span class="text-primary fw-bold fs-4 me-3">${label}.</span>
              <div class="fs-5">${content}</div>
            </div>
            ${icon}
          </div>
        </div>`;
      });
      html += `</div>`;

      let resultBar = "";
      if (notAnswered) {
        resultBar = `<div class="mx-auto mt-4 rounded-4 overflow-hidden" style="max-width:480px">
        <div class="bg-warning bg-opacity-10 text-white py-3 px-4 text-center fw-bold">
          <i class="fas fa-clock me-2"></i>Đáp án chưa được chọn!
        </div>
      </div>`;
      } else if (!hasAnswerKey) {
        resultBar = '<div class="alert alert-info mt-4">Đã chọn đáp án. Giáo viên chưa cho phép xem đáp án đúng.</div>';
      } else if (isCorrect) {
        resultBar = `<div class="mx-auto mt-4 rounded-4 overflow-hidden" style="max-width:480px">
        <div class="bg-success text-white py-3 px-4 d-flex align-items-center justify-content-center gap-3">
          <i class="fas fa-check-circle fa-2x"></i>
          <strong class="fs-5 mb-0">Đáp án chọn chính xác!</strong>
        </div>
      </div>`;
      } else {
        const selectedLabel = String.fromCharCode(
          65 + item.cautraloi.indexOf(selectedOp)
        );
        const correctLabel = String.fromCharCode(
          65 + item.cautraloi.indexOf(correctOp)
        );
        resultBar = `<div class="mx-auto mt-4 rounded-4 overflow-hidden" style="max-width:480px">
        <div class="bg-danger text-white py-3 px-4 d-flex align-items-center justify-content-center gap-3">
          <i class="fas fa-times-circle fa-2x"></i>
          <div class="text-center">
            <strong class="fs-5 mb-0">Đáp án chọn không đúng!</strong><br>
          </div>
          <i class="fas fa-lightbulb-on"></i>
        </div>
      </div>`;
      }

      html += resultBar;

      if (!inGroup) {
        html += `</div></div>`;
      } else {
        html += `</div>`;
      }
    });

    if (inGroup) {
      html += `</div></div>`;
    }

    $("#content-file").html(html);
  }

  function renderEssayAnswer(item) {
    const hasText = item.noidung_tra_loi && item.noidung_tra_loi.trim() !== "";
    const hasImages =
      item.ds_hinhanh && item.ds_hinhanh.trim() !== "";
    let html = "";

    html += `
    <div class="mt-4">
      <div class="text-primary fw-bold mb-3 d-flex align-items-center gap-2">
        <i class="fas fa-pen-fancy"></i>
        <span>Bài làm của học sinh</span>
      </div>`;

    if (hasText || hasImages) {
      if (hasText) {
        html += `
        <div class="bg-white p-4 rounded-3 border shadow-sm mb-4">
          <div class="lh-lg">${window.examEssayHtml(item.noidung_tra_loi)}</div>
        </div>`;
      }

      if (hasImages) {
        const imgs = item.ds_hinhanh.split("||");
        html += `<div class="${hasText ? "mt-2" : "mt-3"}">
    <div class="row g-3">`;

        imgs.forEach((b64, idx) => {
          html += `
      <div class="col-12 ${
        imgs.length === 1 ? "col-md-8 mx-auto" : "col-md-6"
      }">
        <div class="border rounded-3 overflow-hidden shadow-sm">
          <img src="${b64}"
               class="img-fluid w-100"
               style="max-height:500px; object-fit:contain;background:var(--color-chalk-canvas)">
        </div>
      </div>`;
        });

        html += `</div></div>`; // đóng row + container

        // Dòng giải thích đẹp khi chỉ có ảnh
        if (!hasText) {
          html += `
     <div class="text-center mt-3">
            <em class="text-muted small">
              <i class="fas fa-image me-1"></i>
              Bạn chỉ nộp hình ảnh (không nộp dạng văn bản)
            </em>
          </div>`;
        }
      }
    } else {
      html += `
     <div class="text-center mt-3">
            <em class="text-muted small">
              <i class="fas fa-image me-1"></i>
              Bạn chỉ nộp hình ảnh (không nộp dạng văn bản)
            </em>
          </div>`;
    }

    html += `</div>`;

    const diemCau =
      item.diem_cham_tuluan !== null && item.diem_cham_tuluan !== undefined
        ? parseFloat(item.diem_cham_tuluan).toFixed(2)
        : null;

    html += `
    <div class="mt-4 pt-3 border-top">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div class="d-flex align-items-center gap-3">
          <div class="text-primary fw-bold">
            <i class="fas fa-chalkboard-teacher me-2"></i>
            Điểm giáo viên chấm:
          </div>
          ${
            diemCau !== null
              ? `<span class="badge bg-success fs-5 px-4 py-2 rounded-pill">
                 <i class="fas fa-star me-1"></i> ${diemCau} điểm
               </span>`
              : `<em class="text-muted"><i class="fas fa-clock me-2"></i>Chưa chấm điểm</em>`
          }
        </div>
        ${
          diemCau !== null
            ? `<small class="text-success opacity-80"><i class="fas fa-check-circle"></i> Đã chấm xong</small>`
            : `<small class="text-warning opacity-80"><i class="fas fa-hourglass-half"></i> Đang chờ chấm</small>`
        }
      </div>
    </div>`;

    return html;
  }
  function renderEssayAnswer(item) {
    const hasText = item.noidung_tra_loi && item.noidung_tra_loi.trim() !== "";
    const hasImages =
      item.ds_hinhanh && item.ds_hinhanh.trim() !== "";
    let html = "";

    if (hasText || hasImages) {
      html += `
      <div class="mt-4">
        <div class="text-primary fw-bold mb-3 d-flex align-items-center gap-2">
          <i class="fas fa-pen-fancy"></i>
          <span>Câu trả lời của thí sinh</span>
        </div>`;

      if (hasText) {
        html += `
        <div class="bg-white p-4 rounded-3 border shadow-sm mb-4">
          <div class="lh-lg">${window.examEssayHtml(item.noidung_tra_loi)}</div>
        </div>`;
      }

      // Ảnh (nếu có)
      if (hasImages) {
        const imgs = item.ds_hinhanh.split("||");

        html += `<div class="${hasText ? "mt-2" : "mt-1"}">
        <div class="text-primary fw-bold mb-3 d-flex align-items-center gap-2">
        
         
        </div>
        <div class="row g-3">`;

        imgs.forEach((b64, idx) => {
          html += `
          <div class="col-12 ${
            imgs.length === 1 ? "col-md-8 mx-auto" : "col-md-6"
          }">
            <div class="border rounded-3 overflow-hidden shadow-sm">
              <img src="${b64}"
                   class="img-fluid w-100"
                   style="max-height:500px; object-fit:contain;background:var(--color-chalk-canvas)">
            </div>
          </div>`;
        });

        html += `</div></div>`;

        // Dòng giải thích đẹp khi chỉ có ảnh
        if (!hasText) {
          html += `
          <div class="text-center mt-3">
            <em class="text-muted small">
              <i class="fas fa-image me-1"></i>
              Bạn chỉ nộp hình ảnh (không nộp dạng văn bản)
            </em>
          </div>`;
        }
      }

      html += `</div>`;
    }

    // === ĐIỂM GIÁO VIÊN – HIỆN LUÔN DÙ CÓ NỘI DUNG HAY KHÔNG ===
    const diemCau =
      item.diem_cham_tuluan !== null && item.diem_cham_tuluan !== undefined
        ? parseFloat(item.diem_cham_tuluan).toFixed(2)
        : null;

    // Chỉ hiện phần điểm nếu có ít nhất 1 trong 2 (text hoặc ảnh) HOẶC đã có điểm chấm
    if (hasText || hasImages || diemCau !== null) {
      html += `
      <div class="mt-4 pt-3 border-top">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div class="d-flex align-items-center gap-3">
            <div class="text-primary fw-bold">
              <i class="fas fa-chalkboard-teacher me-2"></i>
              Điểm giáo viên chấm:
            </div>
            ${
              diemCau !== null
                ? `<span class="badge bg-success fs-5 px-4 py-2 rounded-pill">
                   <i class="fas fa-star me-1"></i> ${diemCau} điểm
                 </span>`
                : `<em class="text-muted"><i class="fas fa-clock me-2"></i>Chưa chấm điểm</em>`
            }
          </div>
          ${
            diemCau !== null
              ? `<small class="text-success opacity-80"><i class="fas fa-check-circle"></i> Đã chấm xong</small>`
              : `<small class="text-warning opacity-80"><i class="fas fa-hourglass-half"></i> Đang chờ chấm</small>`
          }
        </div>
      </div>`;
    }

    return html;
  }

  /* ==========================
   KIỂM TRA READING SUB-ESSAY
========================== */
  function isReadingEssay(item) {
    return (
      (item.noidung_tra_loi !== undefined && item.noidung_tra_loi !== null) ||
      (item.diem_cham_tuluan !== undefined &&
        item.diem_cham_tuluan !== null &&
        item.loai !== "essay")
    );
  }
});
