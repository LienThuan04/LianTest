Dashmix.onLoad(() =>
  class {
    static initValidation() {
      Dashmix.helpers("jq-validation"),
        jQuery(".form-taothongbao").validate({
          rules: {
            "name-exam": {
              required: !0,
            },
            "nhom-hp": {
              required: !0,
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

$(document).ready(function () {
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

  $("#nhom-hp").on("change", function () {
    let index = $(this).val();
    showListGroup(index);
  });

  // Xử lý cắt url để lấy mã thông báo
  let url = location.href.split("/");
  let param = 0;
  if (url[url.length - 2] == "update") {
    param = url[url.length - 1];
    getDetail(param);
  }

  function showGroup() {
    let html = "<option></option>";
    $.ajax({
      type: "post",
      url: "/module/loadData",
      async: false,
      data: {
        hienthi: 1,
      },
      dataType: "json",
      success: function (response) {
        groups = response;
        response.forEach((item, index) => {
          html += `<option value="${index}">${
            item.mamonhoc +
            " - " +
            item.tenmonhoc +
            " - NH" +
            item.namhoc +
            " - HK" +
            item.hocky
          }</option>`;
        });
        $("#nhom-hp").html(html);
      },
    });
  }
  // Hiển thị thông tin thông báo
  function showAnnounce(announce) {
    $("#name-exam").val(announce.noidung),
      $("#btn-update-announce").data("id", announce.matb);
    $.when(showGroup()).done(function () {
      $("#nhom-hp").val(findIndexGroup(announce.nhom[0])).trigger("change");
      setGroup(announce.nhom);
    });
  }

  function findIndexGroup(manhom) {
    let i = 0;
    let index = -1;
    while (i <= groups.length && index == -1) {
      index = groups[i].nhom.findIndex((item) => item.manhom == manhom);
      if (index == -1) i++;
    }
    return i;
  }

  function setGroup(list) {
    list.forEach((item) => {
      $(`.select-group-item[value='${item}']`).prop("checked", true);
    });
  }

  function getGroupSelected() {
    let result = [];
    $(".select-group-item").each(function () {
      if ($(this).prop("checked") == true) {
        result.push($(this).val());
      }
    });
    return result;
  }

  $(document).on("click", "#select-all-group", function () {
    let check = $(this).prop("checked");
    $(".select-group-item").prop("checked", check);
  });

  function getDetail(matb) {
    $.ajax({
      type: "post",
      url: "/teacher_announcement/getDetail",
      data: {
        matb: matb,
      },
      dataType: "json",
      success: function (response) {
        showAnnounce(response);
      },
    });
  }

  // Xử lý nút cập nhật thông báo
  // Khởi tạo SweetAlert2
  let e = Swal.mixin({
    buttonsStyling: false,
    target: "#page-container",
    customClass: {
      confirmButton: "btn btn-success m-1",
      cancelButton: "btn btn-danger m-1",
      input: "form-control",
    },
  });

  // Xử lý cập nhật thông báo
  $("#btn-update-announce").click(function (event) {
    event.preventDefault();
    let matb = $(this).data("id");
    if ($(".form-taothongbao").valid()) {
      if (getGroupSelected().length !== 0) {
        e.fire({
          title: "Xác nhận cập nhật",
          text: "Bạn có chắc chắn muốn cập nhật thông báo này?",
          icon: "warning",
          showCancelButton: true,
          customClass: {
            confirmButton: "btn btn-success m-1",
            cancelButton: "btn btn-secondary m-1",
          },
          confirmButtonText: "Vâng, cập nhật!",
          cancelButtonText: "Hủy",
          html: false,
          preConfirm: () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve();
              }, 50);
            }),
        }).then((result) => {
          if (result.isConfirmed) {
            let nowDate = new Date();
            let format = `${nowDate.getFullYear()}/${
              nowDate.getMonth() + 1
            }/${nowDate.getDate()} ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()}`;
            $.ajax({
              type: "post",
              url: "/teacher_announcement/updateAnnounce",
              data: {
                matb: matb,
                noidung: $("#name-exam").val(),
                mamonhoc: groups[$("#nhom-hp").val()].mamonhoc,
                manhom: getGroupSelected(),
                thoigiantao: format,
              },
              dataType: "json",
              beforeSend: function () {
                e.fire({
                  title: "Đang cập nhật...",
                  text: "Vui lòng chờ trong giây lát.",
                  icon: "info",
                  allowOutsideClick: false,
                  showConfirmButton: false,
                  didOpen: () => {
                    Swal.showLoading();
                  },
                });
              },
              success: function (response) {
                console.log("Phản hồi từ server (cập nhật):", response); // Debug
                if (response && response.success !== false) {
                  e.fire({
                    title: "Thành công!",
                    text: "Cập nhật thông báo thành công!",
                    icon: "success",
                    confirmButtonText: "OK",
                  }).then(() => {
                    location.href = "/teacher_announcement";
                  });
                } else {
                  e.fire({
                    title: "Lỗi!",
                    text:
                      response.message ||
                      "Cập nhật thông báo không thành công!",
                    icon: "error",
                    confirmButtonText: "OK",
                  });
                }
              },
              error: function (xhr, status, error) {
                console.error(
                  "Lỗi AJAX (cập nhật):",
                  status,
                  error,
                  xhr.responseText
                ); // Debug
                e.fire({
                  title: "Lỗi hệ thống!",
                  text: "Không thể cập nhật thông báo. Vui lòng thử lại sau.",
                  icon: "error",
                  confirmButtonText: "OK",
                });
              },
            });
          }
        });
      } else {
        e.fire({
          title: "Lỗi!",
          text: "Vui lòng chọn ít nhất một nhóm học phần!",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    } else {
      e.fire({
        title: "Lỗi!",
        text: "Vui lòng nhập đầy đủ nội dung thông tin nội dung và chọn nhóm học phần!",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  });
});
