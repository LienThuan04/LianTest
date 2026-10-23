function showData(data) {
  console.log("Data:", data);

  // Sắp xếp theo thời gian vào thi (mới nhất trước)
  data.sort((a, b) =>
    (b.thoigianvaothi || "").localeCompare(a.thoigianvaothi || "")
  );

  let html = "";
  const now = new Date();

  data.forEach((item) => {
    const daThi = !!item.thoigianvaothi;
    const disabled = !daThi ? "opacity-50 pe-none" : "";

    // Xử lý điểm tự luận
    const trangThaiTuLuan = item.trangthai_tuluan || "Chưa chấm";
    const daChamTuLuan = trangThaiTuLuan === "Đã chấm";
    const diemTuLuan = daChamTuLuan ? parseFloat(item.diem_tuluan || 0) : 0;
    // Tính tổng điểm (chỉ cộng điểm tự luận nếu đã chấm)
    const diemTracNghiem = parseFloat(item.diemthi ?? 0);

    const tongDiem = daChamTuLuan
      ? (diemTracNghiem + diemTuLuan).toFixed(2)
      : diemTracNghiem.toFixed(2);

    // Hiển thị điểm trên giao diện
    const hienThiDiem = daChamTuLuan
      ? `<span class="fw-bold fs-5 ${
          tongDiem >= 5 ? "text-success" : "text-danger"
        }">
        ${tongDiem}
      </span>`
      : `<div class="text-center">
        <div class="fw-bold text-danger">${diemTracNghiem.toFixed(2)}</div>
        <small class="text-muted">(Chưa chấm tự luận)</small>
      </div>`;

    // Trạng thái thời gian vào thi
    let statusText = "";
    if (!item.thoigianvaothi) {
      const start = new Date(item.thoigianbatdau);
      const end = new Date(item.thoigianketthuc);
      if (now > end) {
        statusText = '<span class="text-danger fw-bold">(Vắng thi)</span>';
      } else if (now >= start && now <= end) {
        statusText = '<span class="text-warning fw-bold">(Đang thi)</span>';
      } else {
        statusText = '<span class="text-muted">(Chưa tới giờ)</span>';
      }
    } else {
      statusText = new Date(item.thoigianvaothi).toLocaleString("vi-VN");
    }

    // Thời gian làm bài
    const t = item.thoigianlambai || 0;
    const formattedTime = `${String(Math.floor(t / 3600)).padStart(
      2,
      "0"
    )}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(
      t % 60
    ).padStart(2, "0")}`;

    // Có bài tự luận cần chấm không?
    const coTuLuan = ["Chưa chấm", "Đã chấm"].includes(trangThaiTuLuan);

    html += `
      <tr>
        <td data-title="MSSV" class="text-center fw-semibold">${
          item.manguoidung
        }</td>

        <td data-title="Họ tên">
          <div class="d-flex align-items-center py-1">
            <img
              class="img-avatar img-avatar48 me-3 rounded-circle flex-shrink-0"
              src="${avatarUrl(item.avatar, "avatar2.jpg")}"
              onerror="this.src='/public/media/avatars/avatar2.jpg'"
              alt=""
            >
            <div class="min-w-0">
              <div class="fw-bold text-primary text-truncate">${
                item.hoten
              }</div>
              <div class="text-muted small text-truncate">${item.email}</div>
            </div>
          </div>
        </td>

        <!-- CỘT ĐIỂM - ẨN ĐIỂM TỰ LUẬN NẾU CHƯA CHẤM -->
        <td data-title="Điểm" class="text-center align-middle">
          ${hienThiDiem}
        </td>

        <td data-title="Thời gian vào thi" class="text-center align-middle">
          ${statusText}
        </td>

        <td data-title="Thời gian thi" class="text-center align-middle">
          <span class="badge bg-primary px-3 py-2">${formattedTime}</span>
        </td>

        <td data-title="Số lần thoát" class="text-center align-middle">
          <span class="badge rounded-pill ${
            item.solanchuyentab > 3 ? "bg-danger" : "bg-warning"
          } px-3">
            ${item.solanchuyentab || 0}
          </span>
        </td>

        <td data-title="Hành động" class="text-center align-middle">
          <div class="btn-group btn-group-sm" role="group">
            <button
              type="button"
              class="btn btn-alt-secondary show-exam-detail ${disabled}"
              data-id="${item.makq || ""}"
              title="Xem chi tiết bài thi"
            >
              <i class="fa fa-eye"></i>
            </button>

            <button
              type="button"
              class="btn btn-alt-secondary print-pdf ${disabled}"
              data-id="${item.makq || ""}"
              title="In bài làm (PDF)"
            >
              <i class="fa fa-print"></i>
            </button>

            ${
              coTuLuan
                ? `
            <button
              type="button"
              class="btn ${
                daChamTuLuan ? "btn-success" : "btn-warning text-dark"
              }
              btn-cham-tuluan-tu-bang"
              data-makq="${item.makq}"
              data-hoten="${item.hoten}"
              data-mssv="${item.manguoidung}"
              title="${
                daChamTuLuan
                  ? "Đã chấm: " + diemTuLuan.toFixed(2) + " điểm"
                  : "Chưa chấm tự luận"
              }"
            >
              <i class="fa fa-marker"></i>
            </button>`
                : ""
            }
          </div>
        </td>
      </tr>`;
  });

  $("#took_the_exam").html(html);

  // Khởi tạo lại tooltip nếu có
  const tooltipElements = document.querySelectorAll(
    '[data-bs-toggle="tooltip"]'
  );
  tooltipElements.forEach((el) => bootstrap.Tooltip.getOrCreateInstance(el));
}
const made = document.getElementById("chitietdethi").dataset.id;

// Lấy danh sách mã nhóm
const listGroupID = [];
document.querySelectorAll(".filtered-by-group").forEach(function (element) {
  const id = element.dataset.value;
  listGroupID.push(+id);
});
let currentGroupID = listGroupID[0];

$(document).ready(function () {
  $("[data-bs-target='#modal-cau-hoi']").click(function (e) {
    e.preventDefault();
    let made = $(this).data("id");
    $.ajax({
      type: "post",
      url: "/test/getQuestionOfTestManual",
      data: {
        made: made,
      },
      dataType: "json",
      success: function (response) {
        showListQuestion(response);
      },
    });
  });

  function showListQuestion(questions) {
    let html = ``;

    questions.forEach((question, index) => {
      html += `<div class="question rounded border mb-3 bg-white" id="c${
        index + 1
      }">
      <div class="question-top p-3">
        <p class="question-content fw-bold mb-3">${index + 1}. ${
        question.noidung
      }</p>
        <div class="row">`;

      question.cautraloi.forEach((ctl, i) => {
        let content = "";

        // Nếu có hình ảnh
        if (ctl.hinhanh && ctl.hinhanh.trim() !== "") {
          content = `<img src="${ctl.hinhanh}" alt="Hình ảnh đáp án" class="img-fluid">`;
        } else {
          content = ctl.noidungtl; // hiển thị text
        }

        html += `<div class="col-6 mb-1">
          <p class="mb-1"><b>${String.fromCharCode(i + 65)}.</b> ${content}</p>
        </div>`;
      });

      html += `</div></div></div>`;
    });

    $("#list-question").html(html);
  }

  var made = $("#chitietdethi").data("id");

  // Dropdown
  $(".filtered-by-group").click(function (e) {
    e.preventDefault();
    $(".btn-filtered-by-group").text($(this).text());
    currentGroupID = $(this).data("value");
    mainPagePagination.option.manhom =
      currentGroupID == 0 ? listGroupID.slice(1) : currentGroupID;
    resetFilterState();
    renderTableTitleColumns();
    resetSortIcons();
    mainPagePagination.getPagination(
      mainPagePagination.option,
      mainPagePagination.valuePage.curPage
    );
  });

  $(".filtered-by-state").click(function (e) {
    e.preventDefault();
    $(".btn-filtered-by-state").text($(this).text());
    const state = $(this).data("state");
    mainPagePagination.option.filter = state;
    renderTableTitleColumns(state);
    resetSortIcons();

    mainPagePagination.getPagination(
      mainPagePagination.option,
      mainPagePagination.valuePage.curPage
    );
  });

  // Hiển thị đề kiểm tra đáp án + câu trả lời của thí sinh đó
  function showTestDetail(questions) {
    let html = "";
    let openCards = 0; // Đếm số card đang mở (để đóng đúng)

    const closeAllOpenCards = () => {
      while (openCards > 0) {
        html += `</div></div>`;
        openCards--;
      }
    };

    questions.forEach((item, index) => {
      const correctOp = item.cautraloi?.find((op) => op.ladapan == 1);
      const selectedOp = item.cautraloi?.find(
        (op) => op.macautl === item.dapanchon
      );
      const isCorrect =
        selectedOp && correctOp && selectedOp.macautl === correctOp.macautl;
      const isWrong = selectedOp && !isCorrect;
      const notAnswered = !item.dapanchon;

      const normalizedContext = item.context
        ? item.context.replace(/\s+/g, " ").trim()
        : null;

      // === 1. ĐÓNG TẤT CẢ CARD MỞ KHI CHUYỂN SANG CÂU KHÔNG PHẢI READING ===
      if (item.loai !== "reading" && openCards > 0) {
        closeAllOpenCards();
      }

      // === 2. MỞ NHÓM READING MỚI NẾU CẦN ===
      if (item.loai === "reading" && normalizedContext) {
        // Lấy context của câu reading đầu tiên trong nhóm để so sánh
        const currentGroupContext = normalizedContext;

        // Nếu đây là nhóm reading mới (context khác với câu reading trước đó)
        if (currentGroupContext !== window.lastReadingContext) {
          // Đóng nhóm reading cũ nếu có
          if (openCards > 0) {
            closeAllOpenCards();
          }

          // Mở card reading + card-body
          let contextHtml = item.context
            .split(/\n{2,}/)
            .map((para, i, arr) => {
              const mbClass = i === arr.length - 1 ? "mb-0" : "mb-3";
              return `<p class="text-muted small lh-lg ${mbClass}">${para.replace(
                /\n/g,
                "<br>"
              )}</p>`;
            })
            .join("");

          html += `
        <div class="card mb-5 border-0 shadow rounded-4 overflow-hidden">
          <div class="card-body p-4 p-md-5">
            <div class="bg-light rounded-3 p-3">
              <h6 class="text-primary fw-bold mb-2">
                <i class="fas fa-book-open me-2"></i>
                ${item.tieude_context || "Đoạn văn"}
              </h6>
              ${contextHtml}
            </div>
            <hr class="my-4">`;

          openCards = 1; // đang mở 1 card (reading group)
          window.lastReadingContext = currentGroupContext; // nhớ context hiện tại
        }
      } else {
        // Không phải reading → reset context để lần sau nhận diện nhóm mới
        window.lastReadingContext = null;
      }

      // === 3. MỞ CARD CÂU HỎI ===
      if (openCards === 0) {
        // Câu độc lập
        html += `
      <div class="card mb-5 border-0 shadow rounded-4 overflow-hidden">
        <div class="card-body p-4 p-md-5">
          <h5 class="fw-bold text-dark mb-4">${index + 1}. ${
          item.noidung
        }</h5>`;
        openCards = 1;
      } else {
        // Trong nhóm reading
        html += `
      <div class="question-item mb-5 pt-4 border-top">
        <h5 class="fw-bold text-dark mb-4">${index + 1}. ${item.noidung}</h5>`;
      }

      // === 4. CÂU TỰ LUẬN ===
      const isEssay =
        item.loai === "essay" ||
        item.noidung_tra_loi != null ||
        item.diem_cham_tuluan != null;
      if (isEssay) {
        html += renderEssayBlock(item);
        html += `</div></div>`; // đóng question-item + card-body + card
        openCards = 0;
        return;
      }

      // === 5. TRẮC NGHIỆM ===
      html += `<div class="row g-4 mt-3">`;
      (item.cautraloi || []).forEach((op, i) => {
        const label = String.fromCharCode(65 + i);
        const isSelected = op.macautl === item.dapanchon;
        const isCorrectAnswer = op.ladapan == 1;

        let borderClass = "border-2 border-light";
        let icon = "";

        if (isSelected && isCorrect) {
          borderClass = "border-success border-5 shadow-lg";
          icon = `<i class="fas fa-check-circle fa-3x text-success position-absolute end-0 top-50 translate-middle-y me-4"></i>`;
        } else if (isSelected && isWrong) {
          borderClass = "border-danger border-5 shadow-lg";
          icon = `<i class="fas fa-times-circle fa-3x text-danger position-absolute end-0 top-50 translate-middle-y me-4"></i>`;
        } else if (!isSelected && isCorrectAnswer && item.dapanchon != null) {
          borderClass = "border-success border-5 shadow";
          icon = `<i class="fas fa-check-circle fa-2x text-success position-absolute end-0 top-50 translate-middle-y me-4"></i>`;
        }

        const hasText = op.noidungtl?.trim();
        const hasImage = op.hinhanh?.trim();

        const textBlock = hasText
          ? `<div class="answer-text mb-3 px-3 text-center"><div class="fs-5 fw-medium lh-lg">${op.noidungtl}</div></div>`
          : "";

        const imageBlock = hasImage
          ? `<div class="answer-image text-center mt-2"><img src="${op.hinhanh}" class="img-fluid rounded-4 shadow-sm border" style="max-height: 260px; object-fit: contain;background:var(--color-chalk-canvas)"></div>`
          : "";

        const content =
          textBlock + imageBlock || '<div class="text-muted small">Trống</div>';

        html += `
      <div class="col-12 col-md-6">
        <div class="position-relative rounded-4 ${borderClass} bg-white overflow-hidden transition-all" style="min-height: 180px">
          <div class="p-4 d-flex flex-column justify-content-start align-items-center h-100 text-center">
            <div class="text-primary fw-bold fs-2 mb-3">${label}</div>
            ${content}
          </div>
          ${icon}
        </div>
      </div>`;
      });
      html += `</div>`; // đóng row

      // === 6. THANH KẾT QUẢ ===
      let resultBar = "";
      if (notAnswered) {
        resultBar = `<div class="mx-auto mt-5 rounded-4 overflow-hidden" style="max-width:500px">
        <div class="bg-warning bg-opacity-15 text-dark py-4 px-5 d-flex align-items-center justify-content-center gap-3 border border-warning">
          <i class="fas fa-clock fa-2x"></i>
          <strong class="fs-4">Đáp án chưa được chọn!</strong>
        </div>
      </div>`;
      } else if (isCorrect) {
        resultBar = `<div class="mx-auto mt-5 rounded-4 overflow-hidden" style="max-width:500px">
        <div class="bg-success text-white py-4 px-5 d-flex align-items-center justify-content-center gap-3">
          <i class="fas fa-check-circle fa-3x"></i>
          <strong class="fs-3">Đáp án chọn chính xác!</strong>
        </div>
      </div>`;
      } else {
        resultBar = `<div class="mx-auto mt-5 rounded-4 overflow-hidden" style="max-width:500px">
        <div class="bg-danger text-white py-4 px-5 d-flex align-items-center justify-content-center gap-3">
          <i class="fas fa-times-circle fa-3x"></i>
          <strong class="fs-3">Đáp án chọn không đúng!</strong>
        </div>
      </div>`;
      }
      html += resultBar;

      // === 7. ĐÓNG CÂU HỎI (nếu là câu độc lập) ===
      if (openCards === 1 && item.loai !== "reading") {
        html += `</div></div>`;
        openCards = 0;
      } else if (openCards === 1 && item.loai === "reading") {
        // Trong nhóm reading → chỉ đóng question-item, giữ card lớn mở
        html += `</div>`;
      }
    });

    // Đóng tất cả thẻ còn lại khi kết thúc
    closeAllOpenCards();

    // Xóa biến toàn cục để lần sau dùng lại sạch
    delete window.lastReadingContext;

    $("#content-file").html(html);
  }
  // ==================== HÀM RIÊNG CHO TỰ LUẬN / SUB-ESSAY ====================
  function renderEssayBlock(item) {
    const hasText = item.noidung_tra_loi && item.noidung_tra_loi.trim() !== "";
    const hasImages =
      item.ds_hinhanh && item.ds_hinhanh.trim() !== "";

    let html = `
    <div class="mt-3">
      <div class="text-primary fw-bold mb-3 d-flex align-items-center gap-2">
        <i class="fas fa-pen-fancy"></i>
        <span>Bài làm của học sinh</span>
      </div>`;

    if (hasText || hasImages) {
      if (hasText) {
        html += `
        <div class="bg-white p-4 rounded-3 border shadow-sm mb-4">
          <div class="lh-lg">${item.noidung_tra_loi.replace(
            /\n/g,
            "<br>"
          )}</div>
        </div>`;
      }

      if (hasImages) {
        const imgs = item.ds_hinhanh.split("||");
        html += `<div class="row g-3 ${hasText ? "" : "mt-3"}">`;
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
        html += `</div>`;

        if (!hasText) {
          html += `
          <div class="text-center mt-3">
            <em class="text-muted small">
              <i class="fas fa-image me-1"></i>
              Học sinh chỉ nộp hình ảnh (không nộp dạng văn bản)
            </em>
          </div>`;
        }
      }
    } else {
      html += `
      <div class="text-center py-5 text-muted">
        <i class="fas fa-file-alt fa-3x mb-3 opacity-50"></i>
        <div class="fw-bold">Chưa nộp bài</div>
      </div>`;
    }

    // ==================== ĐIỂM GIÁO VIÊN ====================
    const diemCau =
      item.diem_cham_tuluan !== null && item.diem_cham_tuluan !== undefined
        ? parseFloat(item.diem_cham_tuluan).toFixed(2)
        : null;
    html += `
    <div class="mt-4 pt-3 border-top">
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
      
      <!-- Bên trái: Tiêu đề + Badge điểm (nếu có) -->
      <div class="d-flex align-items-center gap-3 flex-wrap">
        <div class="text-primary fw-bold">
          <i class="fas fa-chalkboard-teacher me-2"></i>
          Điểm giáo viên chấm:
        </div>
        
        ${
          diemCau !== null
            ? `<span class="badge bg-success fs-5 px-4 py-2 rounded-pill shadow-sm">
               <i class="fas fa-star me-1"></i> ${diemCau} điểm
             </span>`
            : `<em class="text-muted"><i class="fas fa-clock me-2"></i>Chưa chấm điểm</em>`
        }
      </div>

      <!-- Bên phải: Trạng thái chấm -->
      ${
        diemCau !== null
          ? `<small class="text-success opacity-80 fw-medium">
             <i class="fas fa-check-circle me-1"></i> Đã chấm xong
           </small>`
          : `<small class="text-warning opacity-80 fw-medium">
             <i class="fas fa-hourglass-half me-1"></i> Đang chờ chấm
           </small>`
      }
      
    </div>
  </div>`;

    return html;
  }

  // Khai báo SweetAlert2 instance dùng chung
  const e = Swal.mixin({
    buttonsStyling: false,
    target: "#page-container",
    customClass: {
      confirmButton: "btn btn-success m-1",
      cancelButton: "btn btn-danger m-1",
      input: "form-control",
    },
  });

  // Xử lý sự kiện khi click nút xem chi tiết bài thi
  $(document).on("click", ".show-exam-detail", function () {
    const makq = $(this).data("id");
    if (!makq || mainPagePagination.option.filter === "interrupted") {
      Swal.fire({
        icon: "warning",
        title: "Không thể xem. Thí sinh chưa làm bài thi !",
      });
      return;
    }

    const modal = new bootstrap.Modal(
      document.getElementById("modal-show-test")
    );
    modal.show();

    $.post(
      "/test/getResultDetail",
      { makq: makq },
      function (res) {
        console.log("Full response:", res);

        let questions = res;
        if (res.data) questions = res.data;
        if (res.questions) questions = res.questions;
        if (res.result) questions = res.result;

        if (!Array.isArray(questions)) {
          console.error("Không tìm thấy mảng câu hỏi!", res);
          Swal.fire({ icon: "error", title: "Lỗi định dạng dữ liệu!" });
          return;
        }

        // Chắc chắn hiện
        setTimeout(() => {
          showTestDetail(questions);
        }, 250);
      },
      "json"
    ).fail(function () {
      modal.hide();
      Swal.fire({ icon: "error", title: "Lỗi server!" });
    });
  });
  function resetSortIcons() {
    document.querySelectorAll(".col-sort").forEach((column) => {
      column.dataset.sortOrder = "default";
    });
  }

  function resetFilterState() {
    mainPagePagination.option.filter = "present";
    $(".btn-filtered-by-state").text("Đã nộp bài");
  }

  function renderTableTitleColumns(state = "present") {
    let html = `
    <th class="text-center col-sort" data-sort-column="manguoidung" data-sort-order="default">MSSV</th>
    <th class="col-sort" data-sort-column="hoten" data-sort-order="default">Họ tên</th>
    `;

    switch (state) {
      case "all":
      case "present":
        html += `
        <th class="text-center col-sort" data-sort-column="diemthi" data-sort-order="default">Điểm</th>
        <th class="text-center col-sort" data-sort-column="thoigianvaothi" data-sort-order="default">Thời gian vào thi</th>
        <th class="text-center col-sort" data-sort-column="thoigianlambai" data-sort-order="default">Thời gian thi</th>
        <th class="text-center col-sort" data-sort-column="solanchuyentab" data-sort-order="default">Số lần thoát</th>
        `;
        break;
      case "absent":
        html += `
        <th class="text-center">Điểm</th>
        <th class="text-center">Thời gian vào thi</th>
        <th class="text-center">Thời gian thi</th>
        <th class="text-center">Số lần thoát</th>
        `;
        break;
      case "interrupted":
        html += `
        <th class="text-center">Điểm</th>
        <th class="text-center col-sort" data-sort-column="thoigianvaothi" data-sort-order="default">Thời gian vào thi</th>
        <th class="text-center">Thời gian thi</th>
        <th class="text-center">Số lần thoát</th>
        `;
        break;
      default:
    }
    html += `
    <th class="text-center">Hành động</th>
    `;
    $(".table-col-title").html(html);
  }

  $(".table-col-title").click(function (e) {
    if (!e.target.classList.contains("col-sort")) {
      return;
    }
    const column = e.target.dataset.sortColumn;

    switch (mainPagePagination.option.filter) {
      case "absent":
        switch (column) {
          case "diemthi":
          case "thoigianvaothi":
          case "thoigianlambai":
          case "solanchuyentab":
            return;
          default:
        }
        break;
      case "interrupted":
        switch (column) {
          case "diemthi":
          case "thoigianlambai":
          case "solanchuyentab":
            return;
          default:
        }
        break;
      default:
    }

    const prevSortOrder = e.target.dataset.sortOrder;
    let currentSortOrder = "";
    switch (prevSortOrder) {
      case "default":
        currentSortOrder = "asc";
        break;
      case "asc":
        currentSortOrder = "desc";
        break;
      case "desc":
        currentSortOrder = "default";
        break;
    }

    if (currentSortOrder === "default") {
      mainPagePagination.option.custom = {};
    } else {
      mainPagePagination.option.custom.function = "sort";
      mainPagePagination.option.custom.column = column;
      mainPagePagination.option.custom.order = currentSortOrder;
    }

    mainPagePagination.valuePage.curPage = 1;
    mainPagePagination.getPagination(
      mainPagePagination.option,
      mainPagePagination.valuePage.curPage
    );

    resetSortIcons();
    e.target.dataset.sortOrder = currentSortOrder;
  });
  $(document).on("click", ".print-pdf", function () {
    let makq = $(this).data("id");

    // Kiểm tra makq có hợp lệ không
    if (makq != "" && makq != null && makq != undefined) {
      window.open(`/test/exportPdf/${makq}`, "_blank");
    } else {
      alert("Thí sinh này không thi nên không có kết quả !!");
    }
  });

  $(document).on("click", "#export_excel", function () {
    const $btn = $(this);
    const oldHtml = $btn.html();

    const manhom = $(".filtered-by-group.active").data("value") || 0;
    const ds = Array.isArray(mainPagePagination.option.manhom)
      ? mainPagePagination.option.manhom
      : [];

    $btn
      .prop("disabled", true)
      .html('<i class="fa fa-spinner fa-spin"></i> Đang xuất...');

    $.ajax({
      url: "/test/exportExcel",
      method: "POST",
      data: { made: made, manhom, ds },
      dataType: "json",
      timeout: 90000,
    })
      .done(function (response) {
        try {
          if (!response || !response.file) {
            Swal.fire("Lỗi", "Không nhận được file từ server!", "error");
            return;
          }
          const $a = $("<a>", {
            href: response.file,
            download: `Bang_diem_${new Date().toLocaleDateString(
              "vi-VN"
            )}.xlsx`,
          });
          $("body").append($a);
          $a[0].click();
          $a.remove();

          // Thông báo thành công
          Swal.fire({
            icon: "success",
            title: "Thành công",
            text: "Xuất file Excel thành công!",
          });
        } catch (e) {
          console.error("Lỗi JS trong done():", e);
          Swal.fire("Lỗi", "Có lỗi xảy ra khi tải file!", "error");
        }
      })

      .fail(function (jqXHR) {
        console.error("Export Excel lỗi:", jqXHR.responseText);
        Swal.fire("Lỗi", "Không thể xuất file. Vui lòng thử lại!", "error");
      })
      .always(function () {
        // Luôn reset nút
        $btn.prop("disabled", false).html(oldHtml);
      });
  });
});

$(".filtered-by-group").click(function (e) {
  e.preventDefault();
  $(".filtered-by-group.active").removeClass("active");
  $(this).addClass("active");
  $(".chart-container").html('<canvas id="myChart"></canvas>');
  getStatictical();
});

$(".filtered-by-static").click(function (e) {
  e.preventDefault();
  $(".filtered-by-static.active").removeClass("active");
  $(this).addClass("active");
  $(".chart-container").html('<canvas id="myChart"></canvas>');
  getStatictical();
});

function getStatictical() {
  $.ajax({
    type: "post",
    url: "/test/getStatictical",
    data: {
      made: made,
      manhom: $(".filtered-by-static.active").data("id"),
    },
    dataType: "json",
    success: function (response) {
      if (response.error) {
        Swal.fire({
          icon: "error",
          title: "Lỗi",
          text: response.error,
        });
        $("#da_nop").text("0");
        $("#chua_nop").text("0");
        $("#khong_thi").text("0");
        $("#diem_trung_binh").text("0");
        $("#diem_duoi_1").text("0");
        $("#diem_duoi_5").text("0");
        $("#diem_lon_5").text("0");
        $("#diem_cao_nhat").text("0");
        showChart([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        return;
      }
      $("#da_nop").text(response.da_nop_bai || 0);
      $("#chua_nop").text(response.chua_nop_bai || 0);
      $("#khong_thi").text(response.khong_thi || 0);
      $("#diem_trung_binh").text(response.diem_trung_binh || 0);
      $("#diem_duoi_1").text(
        (response.thong_ke_diem && response.thong_ke_diem[0]) || 0
      );
      $("#diem_duoi_5").text(
        (response.thong_ke_diem || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
          .slice(0, 5)
          .reduce((a, b) => a + b, 0) || 0
      );
      $("#diem_lon_5").text(
        (response.thong_ke_diem || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
          .slice(5)
          .reduce((a, b) => a + b, 0) || 0
      );
      $("#diem_cao_nhat").text(Math.min(response.diem_cao_nhat || 0, 10)); // Cap at 10
      const chartData =
        Array.isArray(response.thong_ke_diem) &&
        response.thong_ke_diem.length >= 10
          ? response.thong_ke_diem.slice(0, 10)
          : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      showChart(chartData);
    },
    error: function () {
      Swal.fire({
        icon: "error",
        title: "Lỗi",
        text: "Không thể kết nối đến server!",
      });
      showChart([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    },
  });
}

getStatictical();

function showChart(data) {
  if (!Array.isArray(data) || data.length === 0) {
    console.error("Dữ liệu không hợp lệ cho biểu đồ:", data);
    return;
  }

  // Tạo labels động với định dạng khoảng điểm (0-1, 1-2, ..., 9-10)
  const labels = data.map((_, i) => (i === 9 ? `9-10` : `${i}-${i + 1}`));

  const ctx = document.getElementById("myChart").getContext("2d");

  if (window.myChart && typeof window.myChart.destroy === "function") {
    window.myChart.destroy();
  }

  window.myChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Số lượng sinh viên",
          data: data,
          backgroundColor: "rgba(66, 85, 255, 0.8)",
          borderColor: "rgba(66, 85, 255, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
        },
        title: {
          display: true,
          text: "Thống kê điểm thi",
          font: {
            size: 20,
            weight: "normal",
            family: "Inter",
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Số lượng sinh viên",
          },
        },
        x: {
          title: {
            display: true,
            text: "Khoảng điểm",
          },
        },
      },
    },
  });
}
//chấm tự luận
$(document).ready(function () {
  // Ẩn badge số lượng chưa chấm lúc đầu
  $("#count-chua-cham").hide();
  // Load số lượng bài cần chấm ngay khi tải trang để badge hiển thị ngay
  try {
    var madeInitial = $("#chitietdethi").data("id");
    if (madeInitial && madeInitial > 0) {
      loadStudentsEssayToGrade(madeInitial);
    }
  } catch (e) {
    console.error("Lỗi khi load số bài tự luận ban đầu:", e);
  }
});

// ==================== 1. KHI MỞ TAB CHẤM TỰ LUẬN ====================
$("#cham-tuluan-tab").on("shown.bs.tab", function () {
  const made = $("#chitietdethi").data("id");
  if (made && made > 0) {
    loadStudentsEssayToGrade(made);
  }
});

// ==================== 2. LOAD DANH SÁCH SINH VIÊN CÓ BÀI TỰ LUẬN ====================
function loadStudentsEssayToGrade(made, q, status) {
  // ensure search UI exists
  ensureEssaySearchUI();

  var postData = { made: made };
  if (q && q.toString().trim() !== "") postData.q = q.toString().trim();
  // status param: 'all' | 'graded' | 'ungraded'
  status =
    typeof status !== "undefined"
      ? status
      : $("#essay-filter-status").val() || "all";
  postData.status = status;

  $.ajax({
    url: "/test/getListEssaySubmissionsAction",
    type: "POST",
    data: postData,
    dataType: "json",
    success: function (res) {
      if (!res || !res.success || !res.data || res.data.length === 0) {
        $("#danh-sach-sinhvien-tuluan").html(`
          <div class="text-center py-5 text-muted">
            <i class="fas fa-inbox fa-3x mb-3 opacity-50"></i>
            <p class="mb-0">Không có bài nộp tự luận</p>
          </div>
        `);
        $("#count-chua-cham").hide();
        return;
      }

      let html = "";
      let chuaCham = 0;

      res.data.forEach((item) => {
        const tn =
          item.diemthi !== null ? parseFloat(item.diemthi).toFixed(2) : "0.00";
        const tl = parseFloat(item.diem_tuluan_hien_tai || 0).toFixed(2);
        const doc = parseFloat(item.diem_dochieu || 0).toFixed(2);

        const dl = (parseFloat(tn) - parseFloat(doc)).toFixed(2);

        const tong = (parseFloat(tn) + parseFloat(tl)).toFixed(2);

        const daCham = parseFloat(tl) > 0;
        if (!daCham) chuaCham++;

        const hoten = item.hoten?.trim() || item.manguoidung;

        const badge = daCham
          ? `<div class="badge bg-success rounded-pill px-3 py-2"><i class="fas fa-check me-1"></i>${tl}</div>`
          : `<div class="badge bg-warning text-dark rounded-pill px-3 py-2"><i class="fas fa-clock me-1"></i>Chưa chấm</div>`;

        html += `
        <div class="student-item border rounded-3 mb-3 shadow-sm hover-shadow transition-all pointer bg-white"
             data-makq="${item.makq}" 
             data-manguoidung="${item.manguoidung}" 
             data-hoten="${hoten}">

          <div class="p-3">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
              
              <!-- Avatar + Tên + MSSV -->
              <!-- Avatar + Tên + MSSV -->
<div class="d-flex align-items-center flex-grow-1" style="min-width: 0">
  <!-- Avatar -->
  <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 me-3"
       style="width:48px; height:48px; font-size:20px; font-weight:bold">
    <img src="${avatarUrl(item.avatar, "ANHSV.png")}"
         alt="${hoten}"
         class="rounded-circle"
         style="width:100%; height:100%; object-fit:cover">
  </div>

  <!-- Thông tin người dùng (ĐÃ FIX TRÀN TÊN HOÀN HẢO) -->
  <div style="min-width: 0; flex: 1">
    <h6 class="mb-1 fw-bold text-dark text-truncate" title="${hoten}">${hoten}</h6>
    <small class="text-muted text-truncate d-block" title="${item.manguoidung}">
      <i class="fas fa-id-card me-1"></i>${item.manguoidung}
    </small>
  </div>
</div>


              <!-- ĐIỂM - RESPONSIVE HOÀN HẢO -->
             <div class="d-flex align-items-center gap-3 flex-wrap justify-content-end">

  <div class="text-center">
    <small class="text-muted d-block fw-medium">Trắc nghiệm</small>
    <strong class="text-info fs-5">${dl}</strong>
  </div>

  <!-- 🔵 ĐỌC HIỂU -->
  <div class="text-center">
    <small class="text-muted d-block fw-medium">Đọc hiểu</small>
    <strong class="text-warning fs-5">${doc}</strong>
  </div>

  <div class="text-center">
    <small class="text-muted d-block fw-medium">Tự luận</small>
    <strong class="${
      daCham ? "text-success" : "text-danger"
    } fs-5">${tl}</strong>
  </div>

  <div class="text-center border-start ps-3">
    <small class="text-muted d-block fw-medium">Tổng</small>
    <strong class="text-primary fs-4 fw-bold">${tong}đ</strong>
  </div>

</div>


              <!-- Badge trạng thái -->
             <div class="d-flex align-items-center ms-3">
  ${
    daCham
      ? `<span class="badge bg-success fs-6 d-flex align-items-center gap-1">
         <i class="fas fa-check-circle me-2"></i> Đã chấm
       </span>`
      : `<span class="badge bg-warning fs-6 d-flex align-items-center gap-1">
         <i class="fas fa-clock me-2"></i> Chưa chấm
       </span>`
  }
</div>


            </div>
          </div>
        </div>`;
      });

      $("#danh-sach-sinhvien-tuluan").html(html);
      $("#total-chua-cham").text(chuaCham);
      $("#count-chua-cham")
        .text(chuaCham > 0 ? chuaCham : "")
        .toggle(chuaCham > 0);
    },
    error: function () {
      $("#danh-sach-sinhvien-tuluan").html(`
        <div class="text-center py-5 text-danger">
          <i class="fas fa-wifi fa-3x mb-3"></i>
          <p>Lỗi kết nối. Vui lòng thử lại!</p>
        </div>
      `);
    },
  });
}

function ensureEssaySearchUI() {
  if (document.getElementById("essay-search-container")) return;

  const container = document.createElement("div");
  container.id = "essay-search-container";
  container.className = "mb-3";
  container.innerHTML = `
    <div class="row mb-2">
      <div class="col-12">
        <div class="input-group">
          <input id="essay-search-input" type="text" class="form-control" placeholder="Tìm theo tên hoặc MSSV...">
          <button id="essay-search-clear" class="btn btn-outline-secondary" type="button">
            <i class="fa fa-times"></i>
          </button>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="col-auto">
        <select id="essay-filter-status" class="form-select">
          <option value="all">Tất cả</option>
          <option value="ungraded">Chưa chấm</option>
          <option value="graded">Đã chấm</option>
        </select>
      </div>
    </div>
  `;

  const target = document.getElementById("danh-sach-sinhvien-tuluan");
  if (target && target.parentNode) {
    target.parentNode.insertBefore(container, target);

    const $input = $("#essay-search-input");
    const $clear = $("#essay-search-clear");
    const $status = $("#essay-filter-status");

    // Debounce helper
    let timer = null;
    $input.on("input", function () {
      clearTimeout(timer);
      const query = $(this).val();
      timer = setTimeout(() => {
        const made = $("#chitietdethi").data("id");
        const status = $status.val();
        loadStudentsEssayToGrade(made, query, status);
      }, 400);
    });

    $clear.on("click", function () {
      $input.val("");
      const made = $("#chitietdethi").data("id");
      const status = $status.val();
      loadStudentsEssayToGrade(made, "", status);
      $input.focus();
    });

    $status.on("change", function () {
      const made = $("#chitietdethi").data("id");
      const query = $input.val();
      loadStudentsEssayToGrade(made, query, $(this).val());
    });
  }
}

// ==================== 3. KHI CLICK VÀO 1 SINH VIÊN ====================
$(document).on(
  "click",
  "#danh-sach-sinhvien-tuluan .student-item",
  function () {
    const $this = $(this);
    const makq = $this.data("makq");
    const hoten = $this.data("hoten");
    const mssv = $this.data("manguoidung");

    // Active
    $(".student-item").removeClass("active bg-primary text-white");
    $this.addClass("active bg-primary text-white");

    // Hiển thị thông tin sinh viên
    $("#ten-sinhvien-cham").text(hoten);
    $("#mssv-cham").text(mssv);
    $("#khu-vuc-cham-bai").show();

    // Load bài làm
    $.post(
      "/test/getEssayDetailAction",
      { makq: makq },
      function (res) {
        if (!res.success || !res.cautraloi || res.cautraloi.length === 0) {
          $("#noi-dung-tuluan").html(
            '<div class="alert alert-warning text-center">Chưa có bài làm tự luận.</div>'
          );
          $("#tong-diem-tuluan").text("0.00");
          $("#diem-tuluan-input").val("0");
          return;
        }

        let html = "";
        let tong = 0;

        res.cautraloi.forEach((c, i) => {
          const diem = parseFloat(c.diem_cham || 0);
          tong += diem;

          html += `
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-white" style="background:var(--color-chalk-canvas)">
          <h5 class="mb-0"><i class="fas fa-question-circle me-2"></i>Câu ${
            i + 1
          } (Mã: ${c.macauhoi})</h5>
        </div>
        <div class="card-body">
          <div class="mb-4">
            <strong class="text-danger"><i class="fas fa-book-open me-2"></i>Câu hỏi:</strong>
            <div class="bg-light p-3 rounded border mt-2">${
              c.noidung_cauhoi || "—"
            }</div>
          </div>

          <div class="mb-4">
            <strong class="text-success"><i class="fas fa-pen me-2"></i>Câu trả lời:</strong>
            <div class="bg-white p-3 rounded border mt-2 min-vh-20">
              ${
                c.noidung_tra_loi
                  ? c.noidung_tra_loi
                  : '<em class="text-muted">Không có nội dung</em>'
              }
            </div>
          </div>

          ${
            c.hinhanh && c.hinhanh.length > 0
              ? c.hinhanh
                  .map(
                    (img) => `
            <div class="text-center mb-4">
              <img src="${img}" class="img-fluid rounded shadow" style="max-height: 500px">
            </div>`
                  )
                  .join("")
              : ""
          }

          <div class="mt-4 d-flex align-items-center">
            <label class="fw-bold text-primary me-3">Điểm câu này:</label>
            <input type="number" step="0.25" min="0" max="50"
                   class="form-control diem-cau w-25" style="font-size:1.2rem"
                   value="${diem.toFixed(2)}" data-macauhoi="${c.macauhoi}">
            <small class="text-muted ms-3"><i class="fas fa-clock"></i> ${
              c.thoigianlam || "—"
            }</small>
          </div>
        </div>
      </div>`;
        });

        $("#noi-dung-tuluan").html(html);
        $("#tong-diem-tuluan").text(tong.toFixed(2));
        $("#diem-tuluan-input").val(tong.toFixed(2));
        $(".diem-cau").first().focus();
      },
      "json"
    );
  }
);

// ==================== 4. TỰ ĐỘNG TÍNH TỔNG ĐIỂM KHI NHẬP ====================
$(document).on("input change", ".diem-cau", function () {
  let tong = 0;
  $(".diem-cau").each(function () {
    const val = parseFloat($(this).val()) || 0;
    tong += val;
  });
  $("#tong-diem-tuluan").text(tong.toFixed(2));
  $("#diem-tuluan-input").val(tong.toFixed(2));
});
// ==================== CHẤM TRỰC TIẾP ====================
$(document).on("click", ".btn-cham-tuluan-tu-bang", function () {
  const makq = $(this).data("makq");
  const hoten = $(this).data("hoten");
  const mssv = $(this).data("mssv");

  if (!makq) {
    alert("Không tìm thấy mã kết quả!");
    return;
  }

  // 1. Chuyển sang tab Chấm tự luận
  const $tabLink = $(
    '[data-bs-toggle="tab"][data-bs-target="#cham-tuluan"], a[href="#cham-tuluan"]'
  );
  if ($tabLink.length > 0) {
    $tabLink.tab("show");
  } else {
    $("#cham-tuluan").addClass("show active");
    $(".tab-pane").not("#cham-tuluan").removeClass("show active");
    $(
      `.nav-link[data-bs-target="#cham-tuluan"], .nav-link[href="#cham-tuluan"]`
    ).addClass("active");
  }

  // 2. Đợi tab hiện + danh sách sinh viên đã load xong → tự động click vào sinh viên tương ứng
  const waitAndClickStudent = () => {
    const $studentItem = $(
      `#danh-sach-sinhvien-tuluan .student-item[data-makq="${makq}"]`
    );

    if ($studentItem.length > 0) {
      // Tìm thấy → click luôn để load form chấm
      $studentItem.trigger("click");
    } else {
      // Chưa load xong danh sách → đợi thêm chút rồi thử lại (tối đa 3 lần)
      if (waitAndClickStudent.attempts < 6) {
        waitAndClickStudent.attempts++;
        setTimeout(waitAndClickStudent, 300);
      }
    }
  };
  waitAndClickStudent.attempts = 0;

  // 3. Bắt đầu đợi và click
  setTimeout(waitAndClickStudent, 500); // Đảm bảo tab đã chuyển + danh sách bắt đầu load
});

// ==================== 5. LƯU ĐIỂM TỰ LUẬN ====================
let isSavingEssayScore = false; // Chống double submit

$("#form-cham-diem-tuluan").on("submit", function (e) {
  e.preventDefault();

  if (isSavingEssayScore) return;
  isSavingEssayScore = true;

  const $btn = $(this).find("button[type=submit]");
  const $activeItem = $("#danh-sach-sinhvien-tuluan .student-item.active");
  const makq = $activeItem.data("makq");

  if (!makq || makq <= 0) {
    Swal.fire("Lỗi", "Vui lòng chọn sinh viên để chấm!", "error");
    isSavingEssayScore = false;
    return;
  }

  // LẤY TỔNG ĐIỂM TỪ Ô INPUT (người dùng nhập)
  const diemTong = parseFloat($("#diem-tuluan-input").val()) || 0;

  // QUAN TRỌNG: Thu thập điểm từng câu để gửi lên lưu chi tiết
  const diemTungCau = {};
  $(".diem-cau").each(function () {
    const macauhoi = $(this).data("macauhoi");
    const diem = parseFloat($(this).val()) || 0;
    if (macauhoi > 0) {
      diemTungCau[macauhoi] = diem;
    }
  });

  // Vô hiệu hóa nút
  $btn
    .prop("disabled", true)
    .html('<span class="spinner-border spinner-border-sm"></span> Đang lưu...');

  $.post("/test/saveEssayScoreAction", {
    makq: makq,
    diem: diemTong,
    cau: diemTungCau,
  })
    .done(function (res) {
      if (res.success && res.diem_tuluan !== undefined) {
        const diemTuLuan = parseFloat(res.diem_tuluan).toFixed(2);

        Swal.fire({
          icon: "success",
          title: "Thành công!",
          text: `Đã lưu điểm tự luận: ${diemTuLuan} điểm`,
          timer: 1500,
          showConfirmButton: false,
        });

        // Cập nhật badge
        const $badge = $activeItem.find(".badge");
        $badge
          .removeClass("bg-warning text-dark")
          .addClass("bg-success")
          .html(`<i class="fas fa-check-circle me-2"></i>Đã chấm`);

        // Cập nhật điểm tự luận trong danh sách sinh viên
        const $cols = $activeItem.find(".text-center strong.fs-5");
        const diemTracNghiem = parseFloat($cols.eq(0).text()) || 0;
        const diem_dochieu = parseFloat($cols.eq(1).text()) || 0;

        $cols
          .eq(2)
          .text(diemTuLuan)
          .removeClass("text-danger")
          .addClass("text-success");

        // Cập nhật tổng điểm
        const tongDiem = (
          diemTracNghiem +
          diem_dochieu +
          parseFloat(diemTuLuan)
        ).toFixed(2);
        $activeItem.find(".text-center strong.fs-4").text(tongDiem);

        // Cập nhật lại khu vực chấm bài
        $("#tong-diem-tuluan").text(diemTuLuan);
        $("#diem-tuluan-input").val(diemTuLuan);

        // Cập nhật số bài chưa chấm
        const currentCount = parseInt($("#count-chua-cham").text()) || 0;
        if (currentCount > 0) {
          const newCount = currentCount - 1;
          $("#count-chua-cham").text(newCount);
          if (newCount === 0) $("#count-chua-cham").hide();
        }
      } else {
        Swal.fire("Lỗi", res.message || "Không thể lưu điểm tự luận", "error");
      }
    })
    .fail(function (xhr) {
      console.error("Lỗi AJAX:", xhr.responseText);
      Swal.fire(
        "Lỗi hệ thống",
        "Không kết nối được server. Vui lòng thử lại!",
        "error"
      );
    })
    .always(function () {
      isSavingEssayScore = false;
      $btn.prop("disabled", false).html("Lưu điểm");
    });
});
// Pagination
const mainPagePagination = new Pagination();
mainPagePagination.option.controller = "test";
mainPagePagination.option.model = "KetQuaModel";
mainPagePagination.option.made = made;
mainPagePagination.option.manhom = listGroupID.slice(1);
mainPagePagination.option.limit = 10;
mainPagePagination.option.filter = "present";
mainPagePagination.getPagination(
  mainPagePagination.option,
  mainPagePagination.valuePage.curPage
);
