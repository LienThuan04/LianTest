function showData(data) {
  console.log("Dữ liệu nhận được:", JSON.stringify(data, null, 2));
  const $list = $(".list-test");

  if (data.length === 0) {
    $list.html(`<tr><td colspan="8" class="text-center py-5 text-muted">
                  <i class="fa fa-info-circle fa-2x mb-3 d-block"></i>
                  Không có dữ liệu
                </td></tr>`);
    $(".pagination").hide();
    return;
  }

  const uniqueTests = [
    ...new Map(data.map((test) => [test.made, test])).values(),
  ];
  let html = "";

  uniqueTests.forEach((test) => {
    const open = new Date(test.thoigianbatdau);
    const close = new Date(test.thoigianketthuc);
    const now = Date.now();

    // Xác định trạng thái
    let state = { color: "secondary", text: "Chưa mở", icon: "fa-clock" };
    const daThi = test.dathi == 1;

    if (daThi) {
      state = {
        color: "success",
        text: "Đã hoàn thành",
        icon: "fa-check-circle",
      };
    } else if (now >= +open && now <= +close) {
      state = { color: "primary", text: "Đang mở", icon: "fa-play-circle" };
    } else if (now > +close) {
      state = { color: "danger", text: "Quá hạn", icon: "fa-times-circle" };
    }

    // Điểm
    let diemDisplay = "-";
    if (daThi) {
      if (test.xemdiemthi == 0) {
        diemDisplay = `<span class="text-muted fst-italic">Không được xem</span>`;
      } else if (
        test.trangthai_tuluan === "Chưa chấm" ||
        test.trangthai_tuluan == 0
      ) {
        diemDisplay = `<span class="text-warning fw-600">Chờ chấm tự luận</span>`;
      } else {
        const diem =
          (parseFloat(test.diemthi) || 0) + (parseFloat(test.diem_tuluan) || 0);
        diemDisplay = `<span class="fw-bold text-success fs-5">${diem.toFixed(
          2
        )}</span>`;
      }
    }

    // Nhóm
    const tennhomArray =
      test.tennhom?.split(", ").filter((n) => n.trim()) || [];
    const tennhom =
      tennhomArray.length > 0
        ? tennhomArray
            .map(
              (g) => `<span class="badge bg-light text-dark me-1">${g}</span>`
            )
            .join("")
        : `<span class="text-muted fst-italic">Chưa gán nhóm</span>`;

    // Nút hành động thông minh
    let actionBtn = "";
    if (daThi) {
      actionBtn = `<a href="./test/start/${test.made}" class="btn btn-success schedule-action">
                    <i class="fa fa-eye fa-fw" aria-hidden="true"></i><span>Xem lại</span>
                   </a>`;
    } else if (now >= +open && now <= +close) {
      actionBtn = `<a href="./test/start/${test.made}" class="btn btn-primary schedule-action">
                    <i class="fa fa-play fa-fw" aria-hidden="true"></i><span>Làm bài</span>
                   </a>`;
    } else {
      actionBtn = `<button type="button" class="btn btn-outline-secondary schedule-action" disabled>
                    <i class="fa fa-lock fa-fw" aria-hidden="true"></i><span>Chưa mở</span>
                   </button>`;
    }

    html += `
<tr class="transition-all duration-300 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:shadow-md hover:-translate-y-1 border-l-4 border-transparent hover:border-primary">

  <!-- Tên đề thi + Môn -->
  <td data-label="Bài kiểm tra">
  <div class="d-flex align-items-center gap-3">

    <!-- Icon -->
    <div class="flex-shrink-0">
      <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 
                  rounded-xl d-flex align-items-center justify-content-center shadow-lg">
        <i class="fa fa-file-alt text-warning fs-5"></i> <!-- Icon màu trắng -->
      </div>
    </div>

    <!-- Text -->
    <div>
      <div class="fw-bold text-dark fs-5">
        ${test.tende || "Chưa đặt tên"}
      </div>
    </div>

  </div>
</td>


  <!-- Môn học (ẩn trên mobile nếu cần) -->
  <td data-label="Môn học" class="text-muted fw-600">
    ${test.tenmonhoc?.substring(0, 20) || "-"}
  </td>

<!-- Bắt đầu -->
<td data-label="Bắt đầu" class="text-center">
  <div class="d-flex flex-column align-items-center">
    <div class="text-dark fw-bold">${open.toLocaleDateString("vi-VN")}</div>
    <div class="text-primary small fw-600">
      ${open.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </div>
  </div>
</td>

<!-- Kết thúc -->
<td data-label="Kết thúc" class="text-center">
  <div class="d-flex flex-column align-items-center">
    <div class="text-dark fw-bold">${close.toLocaleDateString("vi-VN")}</div>
    <div class="text-danger small fw-600">
      ${close.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </div>
  </div>
</td>


  <!-- Nhóm -->
  <td data-label="Nhóm">
    ${tennhomArray[0] || "Chưa gán"}
  </td>

  <!-- Điểm -->
  <td data-label="Điểm" class="text-center">
    ${
      daThi
        ? test.xemdiemthi == 0
          ? `<span class="text-muted fst-italic">Ẩn</span>`
          : test.trangthai_tuluan === "Chưa chấm" || test.trangthai_tuluan == 0
          ? `<span class="text-warning fw-bold">Chờ chấm</span>`
          : `<span class="text-success fw-bold text-2xl">
              ${(
                (parseFloat(test.diemthi) || 0) +
                (parseFloat(test.diem_tuluan) || 0)
              ).toFixed(1)}
            </span>`
        : `<span class="text-secondary fw-bold text-xl">-</span>`
    }
  </td>

  <!-- Trạng thái -->
  <td data-label="Trạng thái" class="text-center">
    <span class="badge schedule-state rounded-pill px-3 py-2 fw-bold text-white ${
      daThi
        ? "bg-success"
        : now >= +open && now <= +close
        ? "bg-primary"
        : now > +close
        ? "bg-danger"
        : "bg-secondary"
    } shadow-sm">
      ${state.text}
    </span>
  </td>

  <!-- Hành động -->
<td data-label="Thao tác" class="schedule-action-cell text-center">
  ${actionBtn}
</td>


</tr>
`;
  });

  $list.html(
    html ||
      `<tr><td colspan="8" class="text-center py-5 text-muted">Không có dữ liệu hợp lệ</td></tr>`
  );
  $(".pagination").toggle(!!html);
}
// Get current user ID
const container = document.querySelector(".content");
const currentUser = container.dataset.id;
delete container.dataset.id;

$(document).ready(function () {
  $(".filtered-by-state").click(function (e) {
    e.preventDefault();
    $(".btn-filtered-by-state .filter-text").text($(this).text().trim());
    const state = String($(this).data("value"));
    if (state !== "4") {
      mainPagePagination.option.filter = state;
    } else {
      delete mainPagePagination.option.filter;
    }

    mainPagePagination.valuePage.curPage = 1;
    mainPagePagination.getPagination(mainPagePagination.option, 1);
  });
});

// Pagination
const mainPagePagination = new Pagination();
mainPagePagination.option.controller = "client";
mainPagePagination.option.model = "DeThiModel";
mainPagePagination.option.manguoidung = currentUser;
mainPagePagination.option.custom.function = "getUserTestSchedule";
mainPagePagination.getPagination(
  mainPagePagination.option,
  mainPagePagination.valuePage.curPage
);
