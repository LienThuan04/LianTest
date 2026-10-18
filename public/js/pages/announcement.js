Dashmix.helpersOnLoad(["js-flatpickr", "jq-datepicker", "jq-select2"]);

Dashmix.onLoad(() =>
  class {
    static initValidation() {
      Dashmix.helpers("jq-validation"),
        jQuery(".form-taothongbao").validate({
          rules: {
            "name-exam": {
              required: true,
            },
            "nhom-hp": {
              required: true,
            },
          },
          messages: {
            "name-exam": {
              required: "Nhập nội dung thông báo cần gửi",
            },
            "nhom-hp": {
              required: "Vui lòng chọn nhóm học phần",
            },
          },
        });
    }

    static init() {
      this.initValidation();
    }
  }.init()
);

let groups = [];

function showListAnnounce(announces) {
  let html = "";

  if (announces.length > 0) {
    html += `
      <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
        <!-- Header xanh lá đúng tone của anh -->
        <div class="card-header bg-white border-0 py-4 px-4">
          <div class="d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <i class="fa fa-bullhorn fa-lg me-3"></i>
              <h4 class="mb-0 fw-bold">Danh sách thông báo</h4>
            </div>
            <span class="badge bg-white text-success fs-6">${announces.length} thông báo</span>
          </div>
        </div>

        <!-- Table responsive -->
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="bg-light text-success small text-uppercase fw-semibold">
              <tr>
                <th class="ps-4 text-center" style="width: 42%;">Nội dung</th>
                <th class="text-center" style="width: 25%;">Học phần</th>
                <th class="text-center" style="width: 15%;">Thời gian</th>
                <th class="text-center" style="width: 18%;">Hành động</th>
              </tr>
            </thead>
            <tbody class="text-dark">`;

    announces.forEach((announce) => {
      html += `
              <tr class="border-start border-3 border-white hover-border-success transition-all">
                <!-- Nội dung -->
                <td class="ps-4 py-3 text-center">
                  <div class="d-flex align-items-center">
                    <i class="fa fa-comment-alt text-success me-3 flex-shrink-0"></i>
                    <div class="text-truncate-line-2 fw-medium">
                      ${escapeHtml(announce.noidung)}
                    </div>
                  </div>
                </td>

                <!-- Học phần -->
                <td class="text-center small">
                  <div class="fw-semibold text-success" 
                       data-bs-toggle="tooltip" 
                       data-bs-placement="top" 
                       title="${escapeHtml(announce.nhom)}">
                    ${escapeHtml(announce.tenmonhoc)}
                  </div>
                  <div class="text-muted small">${announce.tennamhoc} • ${
        announce.tenhocky
      }</div>
                </td>

                <!-- Thời gian -->
                <td class="text-center small text-muted">
                  <i class="fa fa-clock me-1"></i>
                  ${formatDate(announce.thoigiantao)}
                </td>

                <!-- Nút hành động -->
                <td class="text-center">
                  <div class="btn-group" role="group">
                    <a href="/teacher_announcement/update/${announce.matb}"
                       class="btn btn-sm btn-outline-success rounded-pill px-3"
                       data-role="thongbao" data-action="update">
                      <i class="fa fa-edit"></i>
                    </a>
                    <button type="button"
                            class="btn btn-sm btn-outline-danger rounded-pill px-3 btn-delete"
                            data-role="thongbao" data-action="delete"
                            data-id="${announce.matb}">
                      <i class="fa fa-trash-alt"></i>
                    </button>
                  </div>
                </td>
              </tr>`;
    });

    html += `
            </tbody>
          </table>
        </div>

        <!-- Gợi ý kéo ngang trên mobile -->
        <div class="card-footer bg-light border-0 py-3 text-muted small text-center d-md-none">
          Kéo ngang để xem thêm ← →
        </div>
      </div>`;
  } else {
    html += `
      <div class="text-center py-5 my-5">
        <i class="fa fa-bell-slash text-muted mb-4" style="font-size: 4.5rem; opacity: 0.4;"></i>
        <h5 class="text-muted mb-2">Chưa có thông báo nào</h5>
        <p class="text-muted">Khi có thông báo mới, chúng sẽ xuất hiện ở đây.</p>
      </div>`;
    $(".pagination").hide();
  }

  $(".list-announces").html(html);

  // Khởi tạo tooltip
  document
    .querySelectorAll('[data-bs-toggle="tooltip"]')
    .forEach((el) => new bootstrap.Tooltip(el));
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function loadFilterSemesters() {
  $.ajax({
    type: "POST",
    url: "/module/loadData",
    data: { hienthi: 2 },
    dataType: "json",
    success: function (response) {
      let html = '<option value="">Tất cả học kỳ</option>';
      const seen = new Set();

      response.forEach((item) => {
        // module.loadData() returns objects with keys: manamhoc, tennamhoc, mahocky, tenhocky
        const key = `${item.manamhoc}-${item.mahocky}`;
        if (!seen.has(key)) {
          seen.add(key);
          // Display readable names
          const label = item.tennamhoc
            ? `${item.tennamhoc} - ${item.tenhocky || ""}`
            : `${item.manamhoc} - ${item.mahocky}`;
          html += `<option value="${key}">${label}</option>`;
        }
      });

      $("#filter-kihoc").html(html);
    },
    error: function (xhr, status, error) {
      console.error("Error loading semesters:", status, error);
    },
  });
}

function loadFilterSubjects(kihoc = null) {
  return new Promise((resolve, reject) => {
    const data = { hienthi: 1 };
    if (kihoc) {
      const [namhoc, hocky] = kihoc.split("-");
      data.namhoc = namhoc;
      data.hocky = hocky;
    }

    $.ajax({
      type: "POST",
      url: "/module/loadData",
      data: data,
      dataType: "json",
      success: function (response) {
        let html = '<option value="">Tất cả học phần</option>';
        const seen = new Set();
        response.forEach((item) => {
          if (!seen.has(item.tenmonhoc)) {
            seen.add(item.tenmonhoc);
            html += `<option value="${item.mamonhoc}">${item.tenmonhoc}</option>`;
          }
        });
        $("#filter-nhomhocphan").html(html);
        resolve();
      },
      error: function (xhr, status, error) {
        console.error("Error loading subjects:", status, error);
        reject(error);
      },
    });
  });
}

$(document).ready(function () {
  function applyFilters() {
    const keyword = $("#search-input").val().trim();
    const kihoc = $("#filter-kihoc").val();
    const mamonhoc = $("#filter-nhomhocphan").val();

    const filter = {};

    // Nếu có học kỳ, tách năm học và học kỳ ra
    if (kihoc) {
      const [namhoc, hocky] = kihoc.split("-");
      filter.namhoc = namhoc;
      filter.hocky = hocky;
    }

    // Nếu có môn học được chọn
    if (mamonhoc) {
      filter.mamonhoc = mamonhoc;
    }
    if (keyword) {
      filter.keyword = keyword;
    }

    console.log("Applying filters:", filter);

    mainPagePagination.getPagination(
      {
        ...mainPagePagination.option,
        input: keyword,
        filter: filter,
      },
      1
    );
  }

  function showGroup() {
    let html = "<option value='' disabled selected>Chọn nhóm học phần</option>";
    $.ajax({
      type: "POST",
      url: "/module/loadData",
      async: false,
      data: { hienthi: 1 },
      dataType: "json",
      success: function (response) {
        console.log("Dữ liệu nhóm học phần:", response); // Debug
        groups = response;
        response.forEach((item, index) => {
          const yearLabel = item.tennamhoc ? item.tennamhoc : item.manamhoc;
          const hkLabel = item.tenhocky ? item.tenhocky : item.mahocky;
          html += `<option value="${index}">${item.mamonhoc} - ${item.tenmonhoc} -${yearLabel} - ${hkLabel}</option>`;
        });
        $("#nhom-hp").html(html);
      },
      error: function (xhr, status, error) {
        console.error("Error loading groups:", status, error, xhr.responseText);
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times-circle me-1",
          message: "Lỗi khi tải danh sách nhóm học phần!",
        });
      },
    });
    loadFilterSubjects();
  }
  function showListGroup(index) {
    let html = ``;
    if (groups[index].nhom.length > 0) {
      html += `<div class="col-12 mb-3">
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="" id="select-all-group">
                <label class="form-check-label" for="select-all-group">Chọn tất cả</label>
            </div></div>`;
      groups[index].nhom.forEach((item) => {
        html += `<div class="col-4">
                    <div class="form-check">
                        <input class="form-check-input select-group-item" type="checkbox" value="${item.manhom}"
                            id="nhom-${item.manhom}" name="nhom-${item.manhom}">
                        <label class="form-check-label" for="nhom-${item.manhom}">${item.tennhom}</label>
                    </div>
                </div>`;
      });
    } else {
      html += `<div class="text-center fs-sm"><img style="width:100px" src="/public/media/svg/empty-state.svg" alt=""></div>`;
    }
    $("#list-group").html(html);
  }

  showGroup();
  loadFilterSemesters();

  $("#nhom-hp").on("change", function () {
    let index = $(this).val();
    if (index) showListGroup(index);
  });

  $(document).on("click", "#select-all-group", function () {
    let check = $(this).prop("checked");
    $(".select-group-item").prop("checked", check);
  });

  function getGroupSelected() {
    let result = [];
    $(".select-group-item").each(function () {
      if ($(this).prop("checked")) {
        result.push($(this).val());
      }
    });
    return result;
  }

  $("#btn-send-announcement").click(function (e) {
    e.preventDefault();
    if ($(".form-taothongbao").valid()) {
      if (getGroupSelected().length !== 0) {
        let nowDate = new Date();
        let format = `${nowDate.getFullYear()}/${
          nowDate.getMonth() + 1
        }/${nowDate.getDate()} ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()}`;

        $.ajax({
          type: "POST",
          url: "/teacher_announcement/sendAnnouncement",
          data: {
            noticeText: $("#name-exam").val(),
            mamonhoc: groups[$("#nhom-hp").val()].mamonhoc,
            manhom: getGroupSelected(),
            thoigiantao: format,
          },
          dataType: "json",
          success: function (response) {
            if (response) {
              Dashmix.helpers("jq-notify", {
                type: "success",
                icon: "fa fa-check-circle me-1",
                message: "Đã gửi thông báo thành công!",
              });
              setTimeout(() => {
                location.href = "/teacher_announcement";
              }, 1500);
            } else {
              Dashmix.helpers("jq-notify", {
                type: "danger",
                icon: "fa fa-times-circle me-1",
                message: "Gửi thông báo thất bại! Vui lòng kiểm tra lại.",
              });
            }
          },
          error: function (xhr, status, error) {
            Dashmix.helpers("jq-notify", {
              type: "danger",
              icon: "fa fa-exclamation-triangle me-1",
              message: "Lỗi hệ thống! Vui lòng thử lại sau.",
            });
            console.error("Lỗi AJAX:", status, error);
          },
        });
      } else {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times-circle me-1",
          message: "Vui lòng chọn ít nhất một nhóm học phần!",
        });
      }
    } else {
      Dashmix.helpers("jq-notify", {
        type: "danger",
        icon: "fa fa-times-circle me-1",
        message:
          "Vui lòng nhập đầy đủ nội dung thông báo và chọn nhóm học phần!",
      });
    }
  });

  function loadListAnnounces() {
    return $.ajax({
      type: "POST",
      url: "/teacher_announcement/getListAnnounce",
      dataType: "json",
      success: function (data) {
        console.log("Announces:", data);
        showListAnnounce(data);
      },
      error: function (xhr, status, error) {
        console.error("Error loading announces:", status, error);
      },
    });
  }

  let e = Swal.mixin({
    buttonsStyling: false,
    target: "#page-container",
    customClass: {
      confirmButton: "btn btn-success m-1",
      cancelButton: "btn btn-danger m-1",
      input: "form-control",
    },
  });

  $(document).on("click", ".btn-delete", function () {
    e.fire({
      title: "Are you sure?",
      text: "Bạn có chắc chắn muốn xoá thông báo?",
      icon: "warning",
      showCancelButton: true,
      customClass: {
        confirmButton: "btn btn-danger m-1",
        cancelButton: "btn btn-secondary m-1",
      },
      confirmButtonText: "Vâng, tôi chắc chắn!",
      html: false,
      preConfirm: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve();
          }, 50);
        }),
    }).then((result) => {
      if (result.isConfirmed) {
        $.ajax({
          type: "POST",
          url: "/teacher_announcement/deleteAnnounce",
          data: {
            matb: $(this).data("id"),
          },
          dataType: "json",
          success: function (response) {
            if (response) {
              e.fire("Deleted!", "Xóa thông báo thành công!", "success");
              mainPagePagination.getPagination(
                mainPagePagination.option,
                mainPagePagination.valuePage.curPage
              );
            } else {
              e.fire("Lỗi!", "Xoá thông báo không thành công!", "error");
            }
          },
          error: function (xhr, status, error) {
            console.error("Error deleting announce:", status, error);
            e.fire("Lỗi!", "Lỗi hệ thống! Vui lòng thử lại.", "error");
          },
        });
        applyFilters();
      }
    });
  });
  $("#filter-kihoc").on("change", function () {
    const selectedSemester = $(this).val(); // ví dụ "2025-1"
    loadFilterSubjects(selectedSemester).then(() => {
      applyFilters();
    });
  });

  $("#filter-kihoc, #filter-nhomhocphan").on("change", function () {
    applyFilters();
  });

  $("#search-input").on("keypress", function (e) {
    if (e.which === 13) {
      applyFilters();
    }
  });

  // The create page reuses form helpers but has no list pagination.
  if (!document.querySelector(".pagination-container")) return;
  const container = document.querySelector(".content");
  const currentUser = container.dataset.id;
  delete container.dataset.id;

  const mainPagePagination = new Pagination(null, null, showListAnnounce);
  mainPagePagination.option.controller = "teacher_announcement";
  mainPagePagination.option.model = "AnnouncementModel";
  mainPagePagination.option.id = currentUser;
  mainPagePagination.getPagination(
    mainPagePagination.option,
    mainPagePagination.valuePage.curPage
  );
});
