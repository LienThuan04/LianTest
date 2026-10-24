Dashmix.helpersOnLoad(["jq-select2"]);

$(document).ready(function () {
  let groups = [];
  let mode = 1;
  $(".btn-join-group").on("click", function () {
    $.ajax({
      type: "post",
      url: "./client/joinGroup",
      data: {
        mamoi: $("#mamoi").val(),
      },
      dataType: "json",
      success: function (response) {
        if (response == 0) {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message: "Mã mời không hợp lệ !",
          });
        } else if (response == 1) {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message: "Bạn đã tham gia nhóm này !",
          });
        } else {
          $("#modal-join-group").modal("hide");
          groups.push(response);
          showListGroup(groups);
          Dashmix.helpers("jq-notify", {
            type: "success",
            icon: "fa fa-check me-1",
            message: "Tham gia nhóm thành công !",
          });
        }
      },
    });
  });

  function loadDataGroups(hienthi) {
    $.ajax({
      type: "post",
      url: "./client/loadDataGroups",
      data: {
        hienthi: hienthi,
      },
      dataType: "json",
      success: function (data) {
        groups = data;
        showListGroup(data);
      },
    });
  }

  loadDataGroups(mode);

  function showListGroup(groups) {
    let html = ``;

    if (groups.length === 0) {
      html = `<p class="text-center my-3 text-muted">Chưa tham gia lớp nào</p>`;
    } else {
      html = `
      <div class="table-responsive">
      <table class="table table-hover table-borderless align-middle shadow-sm rounded">
        <thead class="table-primary text-center">
          <tr>
            <th>STT</th>
            <th>Tên nhóm</th>
            <th>Môn học</th>
            <th>Giảng viên</th>
            <th style="white-space:nowrap;">Năm học</th>
            <th>Học kỳ</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
    `;

      groups.forEach((group, index) => {
        const actionBtn =
          group.hienthi == 1
            ? `<button type="button" class="dropdown-item btn-hide-group" data-id="${group.manhom}"><i class="si si-eye me-2"></i> Ẩn nhóm</button>`
            : `<button type="button" class="dropdown-item btn-unhide-group" data-id="${group.manhom}"><i class="si si-action-undo me-2"></i> Huỷ ẩn</button>`;

        html += `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td><strong>${group.tennhom}</strong></td>
          <td>${group.tenmonhoc}</td>
          <td class="text-center">${group.hoten}</td>
          <td class="text-center" style="white-space:nowrap;">${
            group.tennamhoc
          }</td>
          <td class="text-center">${group.tenhocky}</td>
          <td class="text-center">
            <div class="dropdown d-inline">
              <button class="btn btn-sm btn-light dropdown-toggle" data-bs-toggle="dropdown">
                <i class="fa fa-cog"></i>
              </button>
              <div class="dropdown-menu dropdown-menu-end">
                ${actionBtn}
                <button type="button" class="dropdown-item btn-delete-group" data-id="${
                  group.manhom
                }">
                  <i class="si si-logout me-2"></i> Thoát nhóm
                </button>
              </div>
            </div>
            
            <button class="btn btn-sm btn-outline-primary btn-view-group ms-1"
              data-bs-toggle="offcanvas" data-bs-target="#offcanvasExample"
              data-id="${group.manhom}" data-index="${index}">
              Xem
            </button>
          </td>
        </tr>
      `;
      });

      html += `
        </tbody>
      </table>
      </div>
    `;
    }

    $("#list-groups").html(html);
  }

  $(document).on("click", ".btn-view-group", function () {
    let manhom = $(this).data("id");
    let index = $(this).data("index");
    $(".offcanvas-title").text(
      `${groups[index].tenmonhoc} - NH${groups[index].namhoc} - HK${groups[index].hocky} - ${groups[index].tennhom}`
    );
    loadDataTest(manhom);
    loadDataFriend(manhom);
    loadDataAnnounce(manhom);
  });

  function showListTest(tests) {
    let html = ``;
    if (tests.length != 0) {
      const format = new Intl.DateTimeFormat(navigator.language, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      tests.forEach((test) => {
        const open = new Date(test.thoigianbatdau);
        const close = new Date(test.thoigianketthuc);
        let color = "";
        if (test.diemthi) {
          color = "primary";
        } else {
          const now = Date.now();
          if (now < +open) {
            color = "secondary";
          } else if (now >= +open && now <= +close) {
            color = "success";
          } else {
            color = "danger";
          }
        }
        html += `<div class="block block-rounded block-fx-pop mb-2">
                    <div class="block-content block-content-full border-start border-3 border-${color}">
                        <div class="d-md-flex justify-content-md-between align-items-md-center">
                            <div class="p-1 p-md-2">
                                <h3 class="h4 fw-bold mb-3">
                                    <a href="./test/start/${
                                      test.made
                                    }" class="text-dark link-fx">${
          test.tende
        }</a>
                                </h3>
                                <p class="fs-sm text-muted mb-0">
                                    <i class="fa fa-clock me-1"></i> Diễn ra từ <span>${format.format(
                                      open
                                    )}</span> đến <span>${format.format(
          close
        )}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>`;
      });
    } else {
      html += `<p class="text-center">Chưa có đề thi...</p>`;
    }
    $(".list-test").html(html);
  }

  function showAnnouncement(announces) {
    let html = "";
    if (announces.length != 0) {
      announces.forEach((announce) => {
        html += `
                <li>
                <a class="d-flex text-dark py-2" href="javascript:void(0)">
                    <div class="flex-shrink-0 mx-3">
                        <img class="img-avatar img-avatar48" src="${avatarUrl(
                          announce.avatar,
                          "avatar2.jpg"
                        )}" alt="">
                    </div>
                    <div class="flex-grow-1 fs-sm pe-2">
                        <div class="fw-semibold">${announce.noidung}</div>
                        <div class="text-muted">${formatDate(
                          announce.thoigiantao
                        )}</div>
                    </div>
                </a>
            </li>
                `;
      });
    } else {
      html += `<p class="text-center">Không có thông báo</p>`;
    }
    $(".list-announce").html(html);
  }

  function loadDataTest(manhom) {
    $.ajax({
      type: "post",
      url: "./test/getTestsGroupWithUserResult",
      data: {
        manhom: manhom,
      },
      dataType: "json",
      success: function (response) {
        showListTest(response);
      },
    });
  }

  function loadDataFriend(manhom) {
    $.ajax({
      type: "post",
      url: "./client/getFriendList",
      data: {
        manhom: manhom,
      },
      dataType: "json",
      success: function (response) {
        showListFriend(response);
      },
    });
  }

  function loadDataAnnounce(manhom) {
    $.ajax({
      type: "post",
      url: "./teacher_announcement/getAnnounce",
      data: {
        manhom: manhom,
      },
      dataType: "json",
      success: function (response) {
        showAnnouncement(response);
      },
    });
  }

  function showListFriend(friends) {
    let html = ``;
    if (friends.length != 0) {
      friends.forEach((friend) => {
        html += `<li>
                    <div class="d-flex py-2 align-items-center">
                        <div class="flex-shrink-0 mx-3 overlay-container">
                            <img class="img-avatar img-avatar48" src="${avatarUrl(
                              friend.avatar,
                              "avatar2.jpg"
                            )}" alt="">
                        </div>
                        <div class="fw-semibold">${friend.hoten}</div>
                    </div>
                </li>`;
      });
    } else {
      html += `<p class="text-center">Không có dữ liệu</p>`;
    }
    $(".list-friends").html(html);
  }

  $(".filter-search").click(function (e) {
    e.preventDefault();
    mode = $(this).data("id");
    $(".btn-filter").text($(this).text());
    loadDataGroups(mode);
  });

  $("#form-search-group").on("input", function () {
    let content = $(this).val().toLowerCase();
    let result = groups.filter(
      (item) =>
        item.mamonhoc.toLowerCase().includes(content) ||
        item.tenmonhoc.toLowerCase().includes(content)
    );
    showListGroup(result);
  });

  $(document).on("click", ".btn-hide-group", function (e) {
    e.preventDefault();
    let manhom = $(this).data("id");
    actionHide(manhom, 0, "Ẩn nhóm thành công");
  });

  $(document).on("click", ".btn-unhide-group", function (e) {
    e.preventDefault();
    let manhom = $(this).data("id");
    actionHide(manhom, 1, "Huỷ ẩn nhóm thành công");
  });

  function actionHide(manhom, value, message) {
    $.ajax({
      type: "post",
      url: "./client/hide",
      data: {
        manhom: manhom,
        giatri: value,
      },
      success: function (response) {
        if (response) {
          let index = groups.findIndex((item) => item.manhom == manhom);
          groups.splice(index, 1);
          showListGroup(groups);
          Dashmix.helpers("jq-notify", {
            type: "success",
            icon: "fa fa-check me-1",
            message: message,
          });
        }
      },
    });
  }

  $(document).on("click", ".btn-delete-group", function (e) {
    e.preventDefault();
    const swalWithBootstrapButtons = Swal.mixin({
      customClass: {
        confirmButton: "btn btn-success me-2",
        cancelButton: "btn btn-danger",
      },
      buttonsStyling: false,
    });

    swalWithBootstrapButtons
      .fire({
        title: "Bạn muốn thoát nhóm?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Vâng, Tôi muốn thoát",
        cancelButtonText: "Không, Hủy bỏ!",
      })
      .then((result) => {
        if (result.isConfirmed) {
          $.ajax({
            type: "post",
            url: "./client/delete",
            data: {
              manhom: $(this).data("id"),
            },
            success: function (response) {
              if (response) {
                swalWithBootstrapButtons.fire(
                  "Thoát thành công!",
                  "Bạn đã thoát nhóm thành công",
                  "success"
                );
                loadDataGroups(mode);
              }
            },
          });
        }
      });
  });
});
