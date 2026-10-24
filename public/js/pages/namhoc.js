// Trang Năm học & Học kỳ — bê từ DHT_OneTest/public/js/pages/namhoc.js.
// Khác bản gốc: đổi URL tuyệt đối '/Quanlythitracnghiem/namhoc/..' → '/namhoc/..'
// cho khớp route NestJS (controller path 'namhoc', nằm trong exclude prefix /api).
// Giữ nguyên giao thức cũ: getNamHoc trả {data,total}; add/update/delete trả {success}.
$(document).ready(function () {
  Dashmix.helpersOnLoad(["jq-validation", "jq-select2"]);

  const $list = $("#listNamHoc");
  const $pagination = $(".main-page-pagination");
  const limit = 10;
  let curPage = 1;
  let lastTotal = 0;
  let curQuery = "";

  // =======================
  // RENDER BẢNG NĂM HỌC
  function renderRows(data, page) {
    let html = "";
    let i = (page - 1) * limit + 1;

    if (!data || data.length === 0) {
      html = `<tr><td colspan="5" class="text-center text-muted">Chưa có dữ liệu</td></tr>`;
    } else {
      const currentYear = new Date().getFullYear();

      // 👉 SẮP XẾP NĂM MỚI ĐƯA LÊN ĐẦU
      data.sort((a, b) => {
        const yearA = Number(a.tennamhoc.split("-")[0]);
        const yearB = Number(b.tennamhoc.split("-")[0]);
        return yearB - yearA; // giảm dần
      });

      // Lọc những năm <= hiện tại để tìm năm đang hoạt động
      const pastAndPresent = data.filter((el) => {
        const startYear = Number(el.tennamhoc.split("-")[0]);
        return startYear <= currentYear;
      });

      // Tìm năm bắt đầu lớn nhất nhưng không vượt quá năm hiện tại
      const maxStartYear =
        pastAndPresent.length > 0
          ? Math.max(
              ...pastAndPresent.map((el) => Number(el.tennamhoc.split("-")[0]))
            )
          : null;

      data.forEach((el) => {
        const [startYear] = el.tennamhoc.split("-").map(Number);

        let statusText = "";
        let statusClass = "";

        // 1) CHƯA BẮT ĐẦU
        if (startYear > currentYear) {
          statusText = "Chưa bắt đầu";
          statusClass = "bg-secondary";

          // 2) ĐANG HOẠT ĐỘNG
        } else if (startYear === maxStartYear) {
          statusText = "Đang hoạt động";
          statusClass = "bg-success";

          // 3) ĐÃ QUA
        } else {
          statusText = "Đã qua";
          statusClass = "bg-danger";
        }

        let status = `<span class="badge ${statusClass}">${statusText}</span>`;

        html += `
                <tr>
                    <td>${i++}</td>
                    <td>
                        <a href="javascript:void(0)"
                           class="fw-semibold text-primary btn-view-hocky"
                           data-id="${el.manamhoc}">
                            ${el.tennamhoc}
                        </a>
                    </td>

                    <td class="text-center"><strong>${
                      el.tonghocky || 0
                    }</strong></td>
                    <td class="text-center">${status}</td>

                    <td class="text-center d-flex justify-content-center gap-1">
                        <a href="javascript:void(0)"
                           class="btn btn-sm btn-alt-info btn-view-hocky"
                           data-bs-toggle="tooltip"
                           title="Xem học kỳ"
                           data-id="${el.manamhoc}">
                            <i class="fa fa-eye"></i>
                        </a>

                        <a href="javascript:void(0)"
                           data-role="namhoc" data-action="update"
                           class="btn btn-sm btn-alt-warning btn-edit"
                           data-bs-toggle="tooltip"
                           title="Chỉnh sửa"
                           data-data='${JSON.stringify(el)}'>
                            <i class="fa fa-edit"></i>
                        </a>
                    </td>
                </tr>
            `;
      });
    }

    $list.html(html);

    // KHỞI TẠO TOOLTIPS Bootstrap
    $('[data-bs-toggle="tooltip"]').tooltip();
  }

  // =======================
  // RENDER PHÂN TRANG
  function renderPagination(total, page) {
    lastTotal = total;
    const totalPages = Math.ceil(total / limit) || 1;
    let html = `<nav aria-label="Phân trang năm học"><ul class="pagination justify-content-center">`;

    html += `<li class="page-item ${page <= 1 ? "disabled" : ""}">
               <button type="button" class="page-link" data-page="${page - 1}" aria-label="Trang trước" ${page <= 1 ? "disabled" : ""}>Prev</button>
             </li>`;

    let start = Math.max(1, page - 3);
    let end = Math.min(totalPages, page + 3);
    for (let p = start; p <= end; p++) {
      html += `<li class="page-item ${p === page ? "active" : ""}">
                 <button type="button" class="page-link" data-page="${p}" aria-label="Trang ${p}" ${p === page ? 'aria-current="page" disabled' : ""}>${p}</button>
               </li>`;
    }

    html += `<li class="page-item ${page >= totalPages ? "disabled" : ""}">
               <button type="button" class="page-link" data-page="${page + 1}" aria-label="Trang sau" ${page >= totalPages ? "disabled" : ""}>Next</button>
             </li>`;
    html += `</ul></nav>`;

    $pagination.html(html);
  }

  // =======================
  // LOAD DỮ LIỆU TRANG
  // =======================
  function loadPage(page = 1) {
    curPage = page;
    $.post(
      "/namhoc/getNamHoc",
      { page, limit, q: curQuery },
      function (res) {
        if (!res || typeof res !== "object" || !res.data) {
          renderRows([]);
          renderPagination(0, 1);
          return;
        }

        const data = res.data;
        const total = res.total || 0;

        renderRows(data, page);
        renderPagination(total, page); // Dùng total từ server
        lastTotal = total;
      },
      "json"
    ).fail(function (xhr) {
      console.error("Không thể tải dữ liệu", xhr.responseText);
      renderRows([]);
      renderPagination(0, 1);
    });
  }

  loadPage(1);

  // =======================
  // CLICK PHÂN TRANG
  // =======================
  $pagination.on("click", "button.page-link", function (e) {
    e.preventDefault();
    const p = parseInt($(this).data("page") || 1, 10);
    const totalPages = Math.ceil(lastTotal / limit) || 1;
    if (p >= 1 && p <= totalPages && p !== curPage) {
      loadPage(p);
    }
  });

  // =======================
  // SEARCH
  // =======================
  let typingTimer;
  const typingDelay = 300;
  $("input[name='search-input']")
    .on("keyup", function () {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        curQuery = $(this).val().trim();
        loadPage(1);
      }, typingDelay);
    })
    .on("keydown", function () {
      clearTimeout(typingTimer);
    });

  // ADD NĂM HỌC
  $("#btn-add-namhoc").click(function () {
    $("#form-namhoc")[0].reset();
    $("#form-namhoc input[name=manamhoc]").val("");
    $("#div-sohocky").show();
    $("#modal-namhoc .modal-title").text("Thêm năm học mới");
    $("#modal-namhoc").modal("show");
  });

  // EDIT NĂM HỌC
  $(document).on("click", ".btn-edit", function () {
    const d = $(this).data("data");

    $("#form-namhoc input[name=manamhoc]").val(d.manamhoc);
    $("#form-namhoc input[name=tennamhoc]").val(d.tennamhoc);
    $("#form-namhoc select[name=trangthai]").val(d.trangthai);

    $("#div-sohocky").show();

    $.post(
      "/namhoc/getHocKy",
      { manamhoc: d.manamhoc },
      function (res) {
        if (res && res.length) {
          const maxHocKy = Math.max(...res.map((hk) => hk.sohocky));
          $("#form-namhoc select[name=sohocky]").val(maxHocKy);
        } else {
          $("#form-namhoc select[name=sohocky]").val(3); // default
        }
      },
      "json"
    );

    $("#modal-namhoc .modal-title").text("Sửa năm học");
    $("#modal-namhoc").modal("show");
  });

  // =======================
  // SAVE (ADD/UPDATE) với check lỗi
  // =======================
  $("#form-namhoc").submit(function (e) {
    e.preventDefault();

    const id = $("#form-namhoc input[name=manamhoc]").val();
    const url = id ? "/namhoc/updateNamHoc" : "/namhoc/addNamHoc";

    // kiểm tra input rỗng
    const ten = $("#form-namhoc input[name=tennamhoc]").val().trim();
    if (!ten) {
      Dashmix.helpers("jq-notify", {
        type: "danger",
        message: "Vui lòng nhập tên năm học!",
      });
      return;
    }

    $.post(url, $(this).serialize(), function (res) {
      if (typeof res === "string") res = JSON.parse(res);

      if (res.success) {
        Dashmix.helpers("jq-notify", {
          type: "success",
          message: id ? "Cập nhật thành công!" : "Thêm mới thành công!",
        });
        $("#modal-namhoc").modal("hide");
        loadPage(curPage);
      } else {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          message: res.message || "Lỗi khi lưu dữ liệu!",
        });
      }
    });
  });

  // =======================
  // DELETE NĂM HỌC
  // =======================
  $(document).on("click", ".btn-delete", function () {
    const id = $(this).data("id");
    Swal.fire({
      title: "Xóa năm học?",
      text: "Tất cả học kỳ thuộc năm học này sẽ bị xóa!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Xóa",
      cancelButtonText: "Hủy",
    }).then((r) => {
      if (r.isConfirmed) {
        $.post(
          "/namhoc/deleteNamHoc",
          { manamhoc: id },
          function (res) {
            if (typeof res === "string") res = JSON.parse(res);

            if (res.success) {
              Dashmix.helpers("jq-notify", {
                type: "success",
                message: "Xóa thành công!",
              });
              loadPage(curPage);
            } else {
              Dashmix.helpers("jq-notify", {
                type: "danger",
                message: res.message || "Lỗi khi xóa!",
              });
            }
          }
        );
      }
    });
  });

  // =======================
  // VIEW HỌC KỲ
  // =======================
  $(document).on("click", ".btn-view-hocky", function () {
    const id = $(this).data("id");
    const $btn = $(this);

    // LẤY TÊN NĂM HỌC từ cột thứ 2
    const tenNamHoc = $btn
      .closest("tr")
      .find("td:nth-child(2) a")
      .text()
      .trim();

    $.post(
      "/namhoc/getHocKy",
      { manamhoc: id },
      function (data) {
        let h = "";
        if (data && data.length > 0) {
          data.forEach((hk, idx) => {
            h += `<tr>
                            <td>${idx + 1}</td>
                            <td>${hk.tenhocky}</td>
                          </tr>`;
          });
        } else {
          h = `<tr>
                        <td colspan="2" class="text-center text-muted">Không có học kỳ</td>
                     </tr>`;
        }

        $("#listHocKy").html(h);

        // CẬP NHẬT TITLE MODAL
        $("#modal-hocky .modal-title").text(
          "Chi tiết kỳ của năm học: " + tenNamHoc
        );

        $("#modal-hocky").modal("show");
      },
      "json"
    ).fail(function (xhr) {
      console.error("Lỗi tải học kỳ", xhr.responseText);
    });
  });
});
