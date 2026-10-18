Dashmix.helpersOnLoad(["jq-select2"]);

Dashmix.onLoad(() =>
  class {
    static initValidation() {
      Dashmix.helpers("jq-validation");
      jQuery(".form-add-group").validate({
        rules: {
          "ten-nhom": { required: true },
          "ghi-chu": { required: true },
          "mon-hoc": { required: true },
          "nam-hoc": { required: true },
          "hoc-ky": { required: true },
        },
        messages: {
          "ten-nhom": { required: "Vui lòng nhập tên nhóm" },
          "ghi-chu": { required: "Vui lòng không để trống trường này" },
          "mon-hoc": { required: "Vui lòng chọn môn học" },
          "nam-hoc": { required: "Vui lòng chọn năm học" },
          "hoc-ky": { required: "Vui lòng chọn học kỳ" },
        },
      });
    }

    static init() {
      this.initValidation();
    }
  }.init()
);

$(document).ready(function () {
  const swalWithBootstrapButtons = Swal.mixin({
    customClass: {
      confirmButton: "btn btn-success me-2",
      cancelButton: "btn btn-danger",
    },
    buttonsStyling: false,
  });

  let groups = [];
  let mode = 1;

  function loadDataGroup(hienthi) {
    $.ajax({
      type: "post",
      url: "/module/loadData",
      data: { hienthi: hienthi },
      dataType: "json",
      success: function (response) {
        console.log("Dữ liệu nhóm tải thành công:", response);
        showGroup(response);
        groups = response;
      },
      error: function (xhr, status, error) {
        console.error("Lỗi tải dữ liệu nhóm:", status, error, xhr.responseText);
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: "Lỗi tải dữ liệu nhóm: " + (xhr.responseText || error),
        });
      },
    });
  }

  loadDataGroup(mode);

  function showGroup(list) {
    console.log("Danh sách nhóm:", list);
    let html = "";
    let d = 0;

    if (list.length === 0) {
      html += `<p class="text-center mt-5">Không có dữ liệu</p>`;
    } else {
      list.forEach((item, index) => {
        const htmlbtnhide =
          mode == 1
            ? `<button data-index="${index}" type="button" class="btn btn-outline-secondary btn-sm btn-hide-all ms-2" data-bs-toggle="tooltip" title="Ẩn tất cả"><i class="far fa-eye-slash"></i></button>`
            : `<button data-index="${index}" type="button" class="btn btn-outline-secondary btn-sm btn-unhide-all ms-2" data-bs-toggle="tooltip" title="Khôi phục tất cả"><i class="fa fa-rotate-left"></i></button>`;

        html += `
        <div class="mb-4 p-3 bg-white rounded shadow-sm border-start border-4 border-primary">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h4 class="mb-0 fw-bold text-primary" id="${d++}">
              <span class="mamonhoc">${item.mamonhoc}</span> -
              <span class="tenmonhoc">${item.tenmonhoc}</span> -
              <span class="namhoc">(${item.tennamhoc})</span> -
              <span class="hocky">${item.tenhocky}</span>
            </h4>
            ${htmlbtnhide}
          </div>
          <div class="table-responsive"><table class="table table-bordered table-striped align-middle table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th style="min-width: 40%;">Tên nhóm</th>
                <th style="min-width: 35%;">Ghi chú</th>
                <th style="min-width: 15%;">Sỉ số</th>
                <th style="min-width: 10%;">Thao tác</th>
              </tr>
            </thead>
            <tbody>`;

        item.nhom.forEach((nhom_item) => {
          const btn_hide =
            nhom_item.hienthi == 1
              ? `<a class="dropdown-item btn-hide-group" href="javascript:void(0)" data-id="${nhom_item.manhom}">
                  <i class="fa fa-eye-slash me-2 text-dark"></i>Ẩn nhóm
                </a>`
              : `<a class="dropdown-item btn-unhide-group" href="javascript:void(0)" data-id="${nhom_item.manhom}">
                  <i class="fa fa-undo me-2 text-dark"></i>Khôi phục
                </a>`;

          html += `
          <tr>
            <td>${nhom_item.tennhom}</td>
            <td>${nhom_item.ghichu}</td>
            <td>${nhom_item.siso}</td>
            <td>
              <div class="dropdown">
                <button type="button" class="btn btn-sm btn-secondary dropdown-toggle" data-bs-toggle="dropdown">
                  <i class="fa fa-cogs"></i>
                </button>
                <div class="dropdown-menu dropdown-menu-end fs-sm">
                  <a class="dropdown-item manhom" href="/module/detail/${nhom_item.manhom}">
                    <i class="fa fa-users me-2 text-primary"></i>Danh sách sinh viên
                  </a>
                  <a class="dropdown-item btn-update-group" href="javascript:void(0)" data-id="${nhom_item.manhom}" data-role="hocphan" data-action="update">
                    <i class="fa fa-edit me-2 text-warning"></i>Sửa thông tin
                  </a>
                  ${btn_hide}
                  <a class="dropdown-item btn-delete-group text-danger" href="javascript:void(0)" data-id="${nhom_item.manhom}" data-role="hocphan" data-action="delete">
                    <i class="fa fa-trash me-2 text-danger"></i>Xoá nhóm
                  </a>
                </div>
              </div>
            </td>
          </tr>`;
        });

        html += `
            </tbody>
          </table></div>
        </div>`;
      });
    }

    $("#class-group").html(html);
    $('[data-bs-toggle="tooltip"]').tooltip();
  }

  function handleResponse(res, successDefaultMsg, errorDefaultMsg) {
    let data;
    try {
      data = typeof res === "string" ? JSON.parse(res) : res;
    } catch (e) {
      console.error("Lỗi phân tích JSON:", e, "Phản hồi từ server:", res);
      Dashmix.helpers("jq-notify", {
        type: "danger",
        icon: "fa fa-times me-1",
        message: `Phản hồi không hợp lệ từ server: ${res}`,
      });
      return false;
    }

    if (data.success) {
      Dashmix.helpers("jq-notify", {
        type: "success",
        icon: "fa fa-check me-1",
        message: data.message || successDefaultMsg,
      });
      return true;
    } else {
      console.error("Phản hồi lỗi từ server:", data);
      Dashmix.helpers("jq-notify", {
        type: "danger",
        icon: "fa fa-times me-1",
        message: data.message || errorDefaultMsg,
      });
      return false;
    }
  }

  function precheckAndSubmit(isUpdate = false) {
    if (!$(".form-add-group").valid()) {
      console.log("Form không hợp lệ, kiểm tra các trường bắt buộc.");
      Dashmix.helpers("jq-notify", {
        type: "danger",
        icon: "fa fa-times me-1",
        message: "Vui lòng điền đầy đủ các trường bắt buộc!",
      });
      return;
    }

    const payloadCheck = {
      tennhom: $("#ten-nhom").val(),
      monhoc: $("#mon-hoc").val(),
      namhoc: $("#nam-hoc").val(),
      hocky: $("#hoc-ky").val(),
    };
    if (isUpdate) {
      payloadCheck.manhom = $("#update-group").data("id");
    }

    const btn = isUpdate ? $("#update-group") : $("#add-group");
    btn.prop("disabled", true);

    $.ajax({
      type: "post",
      url: "/module/checkDuplicate",
      data: payloadCheck,
      dataType: "json",
      success: function (check) {
        if (check.duplicate) {
          $("#ten-nhom").addClass("is-invalid");
          if ($(".duplicate-feedback").length === 0) {
            $("#ten-nhom").after(
              '<div class="invalid-feedback duplicate-feedback">' +
                (check.message || "Nhóm trùng lặp.") +
                "</div>"
            );
          } else {
            $(".duplicate-feedback").text(check.message || "Nhóm trùng lặp.");
          }
          Dashmix.helpers("jq-notify", {
            type: "warning",
            icon: "fa fa-exclamation-triangle me-1",
            message: check.message || "Đã tồn tại nhóm trùng.",
          });
          btn.prop("disabled", false);
          return;
        } else {
          $("#ten-nhom").removeClass("is-invalid");
          $(".duplicate-feedback").remove();
        }

        const finalPayload = isUpdate
          ? {
              manhom: payloadCheck.manhom,
              tennhom: $("#ten-nhom").val() || "",
              ghichu: $("#ghi-chu").val() || "",
              monhoc: $("#mon-hoc").val() || "",
              namhoc: $("#nam-hoc").val()
                ? $("#nam-hoc").val().split("-")[0]
                : "",
              hocky: $("#hoc-ky").val() || "",
            }
          : {
              tennhom: $("#ten-nhom").val() || "",
              ghichu: $("#ghi-chu").val() || "",
              monhoc: $("#mon-hoc").val() || "",
              namhoc: $("#nam-hoc").val()
                ? $("#nam-hoc").val().split("-")[0]
                : "",
              hocky: $("#hoc-ky").val() || "",
            };

        const targetUrl = isUpdate ? "/module/update" : "/module/add";

        $.ajax({
          type: "post",
          url: targetUrl,
          data: finalPayload,
          dataType: "json",
          success: function (response) {
            const ok = handleResponse(
              response,
              isUpdate ? "Cập nhật nhóm thành công!" : "Thêm nhóm thành công!",
              isUpdate
                ? "Cập nhật nhóm không thành công!"
                : "Thêm nhóm không thành công!"
            );
            if (ok) {
              $("#modal-add-group").modal("hide");
              loadDataGroup(mode);
            }
          },
          error: function (xhr, status, error) {
            console.error("Lỗi AJAX:", status, error, xhr.responseText);
            Dashmix.helpers("jq-notify", {
              type: "danger",
              icon: "fa fa-times me-1",
              message: `Lỗi hệ thống: ${xhr.responseText || error}`,
            });
          },
          complete: function () {
            btn.prop("disabled", false);
          },
        });
      },
      error: function (xhr, status, error) {
        console.error(
          "Lỗi kiểm tra trùng lặp:",
          status,
          error,
          xhr.responseText
        );
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: `Lỗi khi kiểm tra trùng lặp: ${xhr.responseText || error}`,
        });
        btn.prop("disabled", false);
      },
    });
  }

  // Reset feedback khi mở modal
  $("#modal-add-group").on("show.bs.modal", function () {
    loadNamHoc();
    $("#ten-nhom").removeClass("is-invalid");
    $(".duplicate-feedback").remove();
  });

  // Load subject assignments
  $.get(
    "/subject/getSubjectAssignment",
    function (data) {
      let html = "<option></option>";
      data.forEach((item) => {
        html += `<option value="${item.mamonhoc}">${item.mamonhoc} - ${item.tenmonhoc}</option>`;
      });
      $("#mon-hoc").html(html);
      $("#mon-hoc").select2({ placeholder: "Chọn môn học" });
    },
    "json"
  );

  // Initialize hoc-ky select
  $("#hoc-ky").select2({ placeholder: "Chọn học kỳ" });
  $("#nam-hoc").select2({ placeholder: "Chọn năm học" });
  function loadNamHoc() {
    $.ajax({
      type: "post",
      url: "/module/getNamHoc",
      dataType: "json",
      success: function (res) {
        if (res.success && res.data.length > 0) {
          let options = "<option></option>";
          res.data.forEach((item) => {
            options += `<option value="${item.manamhoc}">${item.tennamhoc}</option>`;
          });
          $("#nam-hoc").html(options).trigger("change.select2");
        } else {
          $("#nam-hoc").html("<option></option>");
          console.warn("Không có dữ liệu năm học hoặc lỗi:", res.message);
        }
      },
      error: function (xhr, status, error) {
        console.error("Lỗi load năm học:", status, error, xhr.responseText);
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: "Không thể tải danh sách năm học!",
        });
      },
    });
  }

  // Khi chọn năm học thì load học kỳ tương ứng
  $("#nam-hoc").on("change", function () {
    const namhoc = $(this).val();
    if (!namhoc) {
      $("#hoc-ky").html("<option></option>").trigger("change.select2");
      return;
    }
    $.ajax({
      type: "post",
      url: "/module/getHocKy",
      data: { namhoc: namhoc },
      dataType: "json",
      success: function (res) {
        if (res.success && res.data.length > 0) {
          let options = "<option></option>";
          res.data.forEach((item) => {
            options += `<option value="${item.mahocky}">${item.tenhocky}</option>`;
          });
          $("#hoc-ky").html(options).trigger("change.select2");
        } else {
          $("#hoc-ky").html("<option></option>").trigger("change.select2");
          console.warn("Không có dữ liệu học kỳ hoặc lỗi:", res.message);
        }
      },
      error: function (xhr, status, error) {
        console.error("Lỗi load học kỳ:", status, error, xhr.responseText);
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: "Không thể tải danh sách học kỳ!",
        });
      },
    });
  });

  $("#add-group").click(function (e) {
    e.preventDefault();
    precheckAndSubmit(false);
  });

  $(document).on("click", ".btn-hide-all", function () {
    let index = $(this).data("index");
    swalWithBootstrapButtons
      .fire({
        title: "Are you sure?",
        text: "Bạn có chắc chắn muốn ẩn hết các nhóm môn học này không!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Chắc chắn!",
        cancelButtonText: "Không!",
      })
      .then((result) => {
        if (result.isConfirmed) {
          groups[index].nhom.forEach((item) => {
            updateHide(item.manhom, 0);
          });
          groups.splice(index, 1);
          Dashmix.helpers("jq-notify", {
            type: "success",
            icon: "fa fa-check me-1",
            message: "Ẩn nhóm thành công!",
          });
          showGroup(groups);
        }
      });
  });

  $(document).on("click", ".btn-unhide-all", function () {
    let index = $(this).data("index");
    swalWithBootstrapButtons
      .fire({
        title: "Are you sure?",
        text: "Bạn có chắc chắn muốn huỷ ẩn hết các nhóm môn học này không!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Chắc chắn!",
        cancelButtonText: "Không!",
      })
      .then((result) => {
        if (result.isConfirmed) {
          groups[index].nhom.forEach((item) => {
            updateHide(item.manhom, 1);
          });
          groups.splice(index, 1);
          Dashmix.helpers("jq-notify", {
            type: "success",
            icon: "fa fa-check me-1",
            message: "Huỷ ẩn nhóm thành công!",
          });
          showGroup(groups);
        }
      });
  });

  $(document).on("click", ".btn-delete-group", function () {
    const manhom = $(this).data("id");
    swalWithBootstrapButtons
      .fire({
        title: "Bạn muốn xóa nhóm?",
        text: "Hành động này không thể hoàn tác. Bạn có chắc chắn muốn tiếp tục?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Vâng, Tôi muốn xóa",
        cancelButtonText: "Không",
        customClass: {
          confirmButton: "btn btn-danger m-1",
          cancelButton: "btn btn-secondary m-1",
        },
      })
      .then((result) => {
        if (result.isConfirmed) {
          $.ajax({
            type: "post",
            url: "/module/delete",
            data: { manhom: manhom },
            dataType: "json",
            success: function (response) {
              if (response.success) {
                swalWithBootstrapButtons.fire(
                  "Xoá thành công!",
                  response.message || "Nhóm đã được xoá thành công",
                  "success"
                );
                loadDataGroup(mode);
              } else {
                swalWithBootstrapButtons.fire(
                  "Lỗi!",
                  response.message || "Xoá nhóm không thành công!",
                  "error"
                );
              }
            },
            error: function (xhr, status, error) {
              console.error("Lỗi xóa nhóm:", status, error, xhr.responseText);
              swalWithBootstrapButtons.fire(
                "Lỗi!",
                `Đã có lỗi xảy ra khi xóa nhóm: ${xhr.responseText || error}`,
                "error"
              );
            },
          });
        }
      });
  });
  $(document).on("click", ".btn-hide-group", function () {
    let manhom = $(this).data("id");
    updateHide(manhom, 0)
      .then((response) => {
        const ok = handleResponse(
          response,
          "Ẩn nhóm thành công!",
          "Ẩn nhóm không thành công!"
        );
        if (ok) {
          removeItem(manhom);
          showGroup(groups);
        }
      })
      .catch((error) => {
        console.error("Lỗi ẩn nhóm:", error);
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: "Ẩn nhóm không thành công!",
        });
      });
  });

  function removeItem(manhom) {
    for (let i = 0; i < groups.length; i++) {
      let index = groups[i].nhom.findIndex((item) => item.manhom == manhom);
      if (index != -1) {
        groups[i].nhom.splice(index, 1);
        if (groups[i].nhom.length == 0) groups.splice(i, 1);
        break;
      }
    }
  }

  $(document).on("click", ".btn-unhide-group", function () {
    let manhom = $(this).data("id");
    updateHide(manhom, 1)
      .then((response) => {
        const ok = handleResponse(
          response,
          "Huỷ ẩn nhóm thành công!",
          "Huỷ ẩn nhóm không thành công!"
        );
        if (ok) {
          removeItem(manhom);
          showGroup(groups);
        }
      })
      .catch((error) => {
        console.error("Lỗi huỷ ẩn nhóm:", error);
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: "Huỷ ẩn nhóm không thành công!",
        });
      });
  });

  function updateHide(manhom, giatri) {
    return new Promise((resolve, reject) => {
      $.ajax({
        type: "post",
        url: "/module/hide",
        data: { manhom: manhom, giatri: giatri },
        dataType: "json",
        success: function (response) {
          resolve(response);
        },
        error: function (xhr, status, error) {
          console.error("Lỗi AJAX hide:", status, error, xhr.responseText);
          reject(error);
        },
      });
    });
  }

  $(document).on("click", ".btn-update-group", function () {
    $(".add-group-element").hide();
    $(".update-group-element").show();
    $("#modal-add-group").modal("show");
    let id = $(this).data("id");
    $("#update-group").data("id", id);
    $.ajax({
      type: "post",
      url: "/module/getDetail",
      data: { manhom: id },
      dataType: "json",
      success: function (response) {
        console.log("Phản hồi từ getDetail:", response);
        if (response.success && response.data) {
          const group = response.data;
          $("#ten-nhom").val(group.tennhom || "");
          $("#ghi-chu").val(group.ghichu || "");
          $("#mon-hoc")
            .val(group.mamonhoc || "")
            .trigger("change");
          // Format namhoc to match select options (e.g., "2023" -> "2023-2024")
          const namhocFormatted = group.namhoc
            ? `${group.namhoc}-${parseInt(group.namhoc) + 1}`
            : "";
          $("#nam-hoc").val(namhocFormatted).trigger("change");
          $("#hoc-ky")
            .val(group.hocky || "")
            .trigger("change");
        } else {
          console.error("Lỗi: Không lấy được chi tiết nhóm:", response.message);
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message: response.message || "Không thể lấy thông tin nhóm!",
          });
        }
      },
      error: function (xhr, status, error) {
        console.error("Lỗi AJAX getDetail:", status, error, xhr.responseText);
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: `Lỗi khi lấy thông tin nhóm: ${xhr.responseText || error}`,
        });
      },
    });
  });

  $("#update-group").click(function (e) {
    e.preventDefault();
    precheckAndSubmit(true);
  });

  $("[data-bs-target='#modal-add-group']").click(function (e) {
    e.preventDefault();
    $(".add-group-element").show();
    $(".update-group-element").hide();
  });

  // Reset form khi đóng modal
  $("#modal-add-group").on("hidden.bs.modal", function () {
    $("#ten-nhom").val("");
    $("#ghi-chu").val("");
    $("#mon-hoc").val("").trigger("change");
    $("#nam-hoc").val("").trigger("change");
    $("#hoc-ky").val("").trigger("change");
  });

  // Thay đổi text khi nhấn vào dropdown
  $(".filter-search").click(function (e) {
    e.preventDefault();
    $(".btn-filter").text($(this).text());
    mode = $(this).data("value");
    loadDataGroup(mode);
  });

  $("#form-search-group").on("input", function () {
    let result = [];
    let content = $(this).val().toLowerCase();
    console.log("Danh sách nhóm để tìm kiếm:", groups);
    for (let i = 0; i < groups.length; i++) {
      if (
        groups[i].mamonhoc.toLowerCase().includes(content) ||
        groups[i].tenmonhoc.toLowerCase().includes(content) ||
        groups[i].namhoc.toLowerCase().includes(content)
      ) {
        result.push(groups[i]);
      }
    }
    showGroup(result);
  });
});
