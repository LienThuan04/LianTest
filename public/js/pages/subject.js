// Trang Môn học & Chương — bê từ DHT_OneTest/public/js/pages/subject.js.
// Khác bản gốc: đổi URL tương đối './subject/..' → '/subject/..' và gộp
// './view_subject/addChapter' → '/subject/addChapter' cho khớp route NestJS
// (controller path 'subject', nằm trong exclude prefix /api). Giữ nguyên giao
// thức cũ: pagination.js gọi getTotalPages/pagination; add trả 'exist'/true.
Dashmix.helpersOnLoad(["js-flatpickr", "jq-datepicker", "jq-select2"]);

Dashmix.onLoad(() =>
  class {
    static initValidation() {
      Dashmix.helpers("jq-validation"),
        jQuery(".form-add-subject").validate({
          rules: {
            mamonhoc: {
              required: true,
            },
            tenmonhoc: {
              required: true,
            },
            sotinchi: {
              required: true,
              number: true,
              min: 1,
              max: 5,
            },

            // --- SỬA Ở ĐÂY ---
            sotiet_lt: {
              required: {
                depends: function () {
                  let type = $("#loaimon").val();
                  return type === "lt" || type === "lt+th";
                },
              },
              number: true,
              min: 0,
            },

            sotiet_th: {
              required: {
                depends: function () {
                  let type = $("#loaimon").val();
                  return type === "th" || type === "lt+th";
                },
              },
              number: true,
              min: 0,
            },
            // -----------------
          },

          messages: {
            mamonhoc: {
              required: "Vui lòng nhập mã môn học",
            },
            tenmonhoc: {
              required: "Vui lòng cung cấp tên môn học",
            },
            sotinchi: {
              required: "Vui lòng cho biết số tín chỉ",
              number: "Số tín chỉ phải là số",
              min: "Số tín chỉ phải lớn hơn 0",
              max: "Số tín chỉ không được vượt quá 5",
            },

            sotiet_lt: {
              required: "Vui lòng nhập số tiết lý thuyết",
              number: "Phải là số",
              min: "Không được nhỏ hơn 0",
            },

            sotiet_th: {
              required: "Vui lòng nhập số tiết thực hành",
              number: "Phải là số",
              min: "Không được nhỏ hơn 0",
            },
          },
        });
    }

    static init() {
      this.initValidation();
    }
  }.init()
);
// Auto handle disable fields based on loaimon
function handleLoaiMon() {
  let type = $("#loaimon").val();

  if (type === "lt") {
    $("#sotiet_lt").prop("disabled", false);
    $("#sotiet_th").prop("disabled", true).val("");
  }

  if (type === "th") {
    $("#sotiet_lt").prop("disabled", true).val("");
    $("#sotiet_th").prop("disabled", false);
  }

  if (type === "lt+th") {
    $("#sotiet_lt").prop("disabled", false);
    $("#sotiet_th").prop("disabled", false);
  }
}

$("#loaimon").on("change", handleLoaiMon);

function showData(subjects) {
  let html = "";

  subjects.forEach((subject) => {
    const statusHtml =
      subject.trangthai == 1
        ? `<span class="text-success"><i class="fa fa-check-circle me-1"></i> Còn hoạt động</span>`
        : `<span class="text-danger"><i class="fa fa-ban me-1"></i> Không còn dạy</span>`;

    html += `
      <tr tid="${subject.mamonhoc}">
        <td class="text-center fs-sm">
          <strong>${subject.mamonhoc}</strong>
        </td>
        <td>${subject.tenmonhoc}</td>
        <td class="d-none d-sm-table-cell text-center fs-sm">
          ${subject.sotinchi}
        </td>
        <td class="d-none d-sm-table-cell text-center fs-sm">
          ${subject.sotietlythuyet}
        </td>
        <td class="d-none d-sm-table-cell text-center fs-sm">
          ${subject.sotietthuchanh}
        </td>

        <!-- CỘT TRẠNG THÁI -->
        <td class="text-center fs-sm">
          ${statusHtml}
        </td>

        <!-- CỘT HÀNH ĐỘNG -->
        <td class="text-center col-action">
          <a
            href="javascript:void(0)"
            class="btn btn-sm btn-alt-warning btn-edit"
            data-role="monhoc"
            data-action="update"
            data-id="${subject.mamonhoc}"
            data-bs-toggle="tooltip"
            data-bs-original-title="Sửa môn học"
            aria-label="Sửa môn học"
          >
            <i class="fa fa-edit"></i>
          </a>

          <a
            href="javascript:void(0)"
            class="btn btn-sm btn-alt-danger btn-delete"
            data-role="monhoc"
            data-action="delete"
            data-id="${subject.mamonhoc}"
            data-bs-toggle="tooltip"
            data-bs-original-title="Xoá môn học"
            aria-label="Xoá môn học"
          >
            <i class="fa fa-trash"></i>
          </a>
        </td>
      </tr>
    `;
  });

  $("#list-subject").html(html);
  $('[data-bs-toggle="tooltip"]').tooltip();
}

$(document).ready(function () {
  $("[data-bs-target='#modal-add-subject']").click(function (e) {
    e.preventDefault();
    $(".update-subject-element").hide();
    $(".add-subject-element").show();
    // Reset form khi mở modal
    $("#mamonhoc").val("");
    $("#tenmonhoc").val("");
    $("#sotinchi").val("");
    $("#sotiet_lt").val("");
    $("#sotiet_th").val("");
    $("#loaimon").val("lt+th"); // Giá trị mặc định
  });

  // Khi thay đổi loại môn, tự động reset và disable trường không dùng
  $("#loaimon").on("change", function () {
    let type = $(this).val();

    if (type === "lt") {
      $("#sotiet_lt").prop("disabled", false);
      $("#sotiet_th").prop("disabled", true).val("");
    }

    if (type === "th") {
      $("#sotiet_lt").prop("disabled", true).val("");
      $("#sotiet_th").prop("disabled", false);
    }

    if (type === "lt+th") {
      $("#sotiet_lt").prop("disabled", false);
      $("#sotiet_th").prop("disabled", false);
    }
  });

  function checkTonTai(mamon) {
    let check = true;
    $.ajax({
      type: "post",
      url: "/subject/checkSubject",
      data: {
        mamon: mamon,
      },
      async: false,
      dataType: "json",
      success: function (response) {
        if (response.length !== 0) {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message: `Môn học đã tồn tại!`,
          });
          check = false;
        }
      },
    });
    return check;
  }

  $("#add_subject").on("click", function () {
    let mamon = $("#mamonhoc").val();
    if ($(".form-add-subject").valid() && checkTonTai(mamon)) {
      $.ajax({
        type: "post",
        url: "/subject/add",
        data: {
          mamon: mamon,
          tenmon: $("#tenmonhoc").val(),
          sotinchi: $("#sotinchi").val(),
          sotietlythuyet: $("#sotiet_lt").val(),
          sotietthuchanh: $("#sotiet_th").val(),
        },
        success: function (response) {
          console.log("Phản hồi:", response);
          if (response === "exist") {
            Dashmix.helpers("jq-notify", {
              type: "warning",
              icon: "fa fa-exclamation me-1",
              message: "Mã môn học đã tồn tại!",
            });
          } else if (response === "1" || response === true) {
            Dashmix.helpers("jq-notify", {
              type: "success",
              icon: "fa fa-check me-1",
              message: "Thêm môn học thành công!",
            });
            $("#modal-add-subject").modal("hide");
            mainPagePagination.getPagination(
              mainPagePagination.option,
              mainPagePagination.valuePage.curPage
            );
          } else {
            Dashmix.helpers("jq-notify", {
              type: "danger",
              icon: "fa fa-times me-1",
              message: "Thêm môn học không thành công!",
            });
          }
        },
      });
    }
  });

  $(document).on("click", ".btn-edit", function () {
    $(".update-subject-element").show();
    $(".add-subject-element").hide();
    let mamon = $(this).data("id");
    $.ajax({
      type: "post",
      url: "/subject/getDetail",
      data: {
        mamon: mamon,
      },
      dataType: "json",
      success: function (response) {
        if (response) {
          $("#mamonhoc").val(response.mamonhoc).prop("disabled", true);
          $("#tenmonhoc").val(response.tenmonhoc);
          $("#sotinchi").val(response.sotinchi);
          $("#sotiet_lt").val(response.sotietlythuyet);
          $("#sotiet_th").val(response.sotietthuchanh);

          // Determine loaimon based on sotietlythuyet and sotietthuchanh
          let sotiet_lt = parseInt(response.sotietlythuyet) || 0;
          let sotiet_th = parseInt(response.sotietthuchanh) || 0;
          let loaimon = "lt+th";
          if (sotiet_lt > 0 && sotiet_th === 0) {
            loaimon = "lt";
          } else if (sotiet_lt === 0 && sotiet_th > 0) {
            loaimon = "th";
          } else if (sotiet_lt > 0 && sotiet_th > 0) {
            loaimon = "lt+th";
          }
          $("#loaimon").val(loaimon);
          handleLoaiMon();

          $("#modal-add-subject").modal("show");
          $("#update_subject").data("id", response.mamonhoc);
        }
      },
    });
  });

  $("#modal-add-subject").on("hidden.bs.modal", function () {
    $("#mamonhoc").val("").prop("disabled", false);
    $("#mamonhoc").val("");
    $("#tenmonhoc").val("");
    $("#sotinchi").val("");
    $("#sotiet_lt").val("");
    $("#sotiet_th").val("");
    $("#loaimon").val("lt+th");
    handleLoaiMon();

    $("#update_subject").data("id", "");
  });

  $("#update_subject").click(function (e) {
    e.preventDefault();
    let mamon = $(this).data("id");
    if ($(".form-add-subject").valid() && checkTonTai(mamon)) {
      $.ajax({
        type: "post",
        url: "/subject/update",
        data: {
          id: mamon,
          mamon: $("#mamonhoc").val(),
          tenmon: $("#tenmonhoc").val(),
          sotinchi: $("#sotinchi").val(),
          sotietlythuyet: $("#sotiet_lt").val(),
          sotietthuchanh: $("#sotiet_th").val(),
        },
        success: function (response) {
          if (response) {
            $("#modal-add-subject").modal("hide");
            Dashmix.helpers("jq-notify", {
              type: "success",
              icon: "fa fa-check me-1",
              message: "Cập nhật môn học thành công!",
            });
            mainPagePagination.getPagination(
              mainPagePagination.option,
              mainPagePagination.valuePage.curPage
            );
          } else {
            Dashmix.helpers("jq-notify", {
              type: "danger",
              icon: "fa fa-times me-1",
              message: "Cập nhật môn học không thành công!",
            });
          }
        },
      });
    }
  });

  $(document).on("click", ".btn-delete", function () {
    let trid = $(this).data("id");
    let e = Swal.mixin({
      buttonsStyling: false,
      target: "#page-container",
      customClass: {
        confirmButton: "btn btn-success m-1",
        cancelButton: "btn btn-danger m-1",
        input: "form-control",
      },
    });

    e.fire({
      title: "Bạn có chắc chắn?",
      text: "Bạn có chắc chắn muốn xóa môn học này?",
      icon: "warning",
      showCancelButton: true,
      customClass: {
        confirmButton: "btn btn-danger m-1",
        cancelButton: "btn btn-secondary m-1",
      },
      confirmButtonText: "Vâng, tôi chắc chắn!",
      cancelButtonText: "Hủy",
      html: false,
      preConfirm: (e) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve();
          }, 50);
        }),
    }).then((result) => {
      if (result.isConfirmed) {
        $.ajax({
          type: "post",
          url: "/subject/delete",
          data: {
            mamon: trid,
          },
          success: function (response) {
            if (response === true || response === "1") {
              e.fire("Thành công!", "Xóa môn học thành công!", "success");
              mainPagePagination.getPagination(
                mainPagePagination.option,
                mainPagePagination.valuePage.curPage
              );
            } else {
              e.fire("Lỗi!", response, "error");
            }
          },
          error: function () {
            e.fire("Lỗi!", "Đã có lỗi xảy ra khi xóa môn học.", "error");
          },
        });
      }
    });
  });

  //chapter
  $(document).on("click", ".subject-info", function () {
    var id = $(this).data("id");
    $("#mamon_chuong").val(id);
    showChapter(id);
  });

  function resetFormChapter() {
    $("#collapseChapter").collapse("hide");
    $("#name_chapter").val("");
  }

  $("#modal-chapter").on("hidden.bs.modal", function () {
    resetFormChapter();
  });

  function showChapter(mamonhoc) {
    $.ajax({
      type: "post",
      url: "/subject/getAllChapter",
      data: {
        mamonhoc: mamonhoc,
      },
      dataType: "json",
      success: function (response) {
        let html = "";
        if (response.length > 0) {
          response.forEach((chapter, index) => {
            html += `<tr>
                        <td class="text-center fs-sm"><strong>${
                          index + 1
                        }</strong></td>
                        <td>${chapter["tenchuong"]}</td>
                        <td class="text-center col-action">
                            <a data-role="chuong" data-action="update" class="btn btn-sm btn-alt-secondary chapter-edit"
                                data-bs-toggle="tooltip" aria-label="Edit" data-bs-original-title="Edit" data-id="${
                                  chapter["machuong"]
                                }">
                                <i class="fa fa-fw fa-pencil"></i>
                            </a>
                            <a data-role="chuong" data-action="delete" class="btn btn-sm btn-alt-secondary chapter-delete" href="javascript:void(0)"
                                data-bs-toggle="tooltip" aria-label="Delete"
                                data-bs-original-title="Delete" data-id="${
                                  chapter["machuong"]
                                }">
                                <i class="fa fa-fw fa-times"></i>
                            </a>
                        </td>
                    </tr>`;
          });
        } else {
          html += `<tr><td class="text-center fs-sm" colspan="3">
                    <img style="width:180px" src="/public/media/svg/empty-state.svg" alt=""/>
                    <p class="text-center mt-3">Không có dữ liệu</p>
                    </td>
                    </tr>`;
        }
        $("#showChapper").html(html);
      },
    });
  }

  $("#btn-add-chapter").click(function () {
    $("#add-chapter").show();
    $("#edit-chapter").hide();
    $("#name_chapter").val("");
  });

  $("#add-chapter").on("click", function (e) {
    e.preventDefault();
    let mamonhoc = $("#mamon_chuong").val();
    if ($("#name_chapter").val() == "") {
      Dashmix.helpers("jq-notify", {
        type: "danger",
        icon: "fa fa-times me-1",
        message: "Tên chương không để trống!",
      });
    } else {
      $.ajax({
        type: "post",
        url: "/subject/addChapter",
        data: {
          mamonhoc: mamonhoc,
          tenchuong: $("#name_chapter").val(),
        },
        success: function (response) {
          if (response) {
            resetFormChapter();
            showChapter(mamonhoc);
          }
        },
      });
    }
  });

  $(".close-chapter").click(function (e) {
    e.preventDefault();
    $("#collapseChapter").collapse("hide");
  });

  $(document).on("click", ".chapter-delete", function () {
    let machuong = $(this).data("id");
    $.ajax({
      type: "post",
      url: "/subject/chapterDelete",
      data: {
        machuong: machuong,
      },
      success: function (response) {
        if (response) {
          Dashmix.helpers("jq-notify", {
            type: "success",
            icon: "fa fa-check me-1",
            message: "Xoá chương thành công!",
          });
          showChapter($("#mamon_chuong").val());
        } else {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message: "Xoá chương không thành công!",
          });
        }
      },
    });
  });

  $(document).on("click", ".chapter-edit", function () {
    $("#add-chapter").hide();
    $("#edit-chapter").show();
    let id = $(this).data("id");
    $("#machuong").val(id);
    $("#collapseChapter").collapse("show");

    setTimeout(() => {
      document.getElementById("collapseChapter").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 300);

    let name = $(this).closest("td").closest("tr").children().eq(1).text();
    $("#name_chapter").val(name);
  });

  $("#edit-chapter").on("click", function (e) {
    e.preventDefault();
    $.ajax({
      type: "post",
      url: "/subject/updateChapter",
      data: {
        machuong: $("#machuong").val(),
        tenchuong: $("#name_chapter").val(),
      },
      success: function (response) {
        if (response) {
          showChapter($("#mamon_chuong").val());
          resetFormChapter();
          Dashmix.helpers("jq-notify", {
            type: "success",
            icon: "fa fa-check me-1",
            message: "Cập nhật chương thành công!",
          });
        } else {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message: "Cập nhật chương không thành công!",
          });
        }
      },
    });
  });
});

// Pagination
const mainPagePagination = new Pagination();
mainPagePagination.option.controller = "subject";
mainPagePagination.option.model = "MonHocModel";
mainPagePagination.option.limit = 10;
mainPagePagination.getPagination(
  mainPagePagination.option,
  mainPagePagination.valuePage.curPage
);
