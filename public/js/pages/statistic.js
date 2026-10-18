$(document).ready(function () {
  // Xử lý thống kê chi tiết
  if ($("#chitietdethi").length) {
    getStatictical();
    $(".filtered-by-static").click(function (e) {
      e.preventDefault();
      $(".filtered-by-static.active").removeClass("active");
      $(this).addClass("active");
      $(".chart-container").html('<canvas id="myChart"></canvas>');
      getStatictical();
    });
  }

  // Xử lý bộ lọc học kỳ và năm học
  if ($(".filter-semester").length || $(".filter-year").length) {
    $(".filter-semester, .filter-year").click(function (e) {
      e.preventDefault();
      $(this).closest(".dropdown-menu").find(".active").removeClass("active");
      $(this).addClass("active");
      $(this).closest(".dropdown").find("span").text($(this).text());

      // Load môn học và nhóm khi chọn học kỳ và năm học
      loadSubjectsAndGroups();
    });
  }

  // Xử lý bộ lọc môn học và nhóm
  $("#subject-menu").on("click", ".filter-subject", function (e) {
    e.preventDefault();

    // Cập nhật chọn môn
    $(this).closest(".dropdown-menu").find(".active").removeClass("active");
    $(this).addClass("active");
    $(this).closest(".dropdown").find("span").text($(this).text());

    // Gọi lại loadGroupBySubject
    loadGroupsBySubject();

    getAggregatedStatictical();
  });
});
function loadGroupsBySubject() {
  const mahocky = $(".filter-semester.active").data("id");
  const namhoc = $(".filter-year.active").data("id");
  const mamonhoc = $(".filter-subject.active").data("id");

  if (!mahocky || !namhoc || !mamonhoc) {
    $("#group-menu").html(
      '<li><a class="dropdown-item" href="javascript:void(0)">Không có nhóm</a></li>'
    );
    $("#dropdown-filter-group").prop("disabled", true);
    $("#dropdown-filter-group span").text("Không có nhóm");
    return;
  }

  $.ajax({
    type: "post",
    url: "/statistic/getGroupsBySubject", // endpoint mới cần tạo
    data: {
      mahocky: mahocky,
      namhoc: namhoc,
      mamonhoc: mamonhoc,
    },
    dataType: "json",
    success: function (response) {
      if (response.error) {
        Swal.fire({
          icon: "error",
          title: "Lỗi",
          text: response.error,
        });
        return;
      }

      $("#group-menu").html(
        response.length > 0
          ? response
              .map(
                (group) => `
                  <li><a class="dropdown-item filter-group" href="javascript:void(0)" data-id="${group.manhom}">
                      ${group.tennhom}
                  </a></li>`
              )
              .join("")
          : '<li><a class="dropdown-item" href="javascript:void(0)">Không có nhóm</a></li>'
      );

      $("#dropdown-filter-group").prop("disabled", response.length === 0);
      $("#dropdown-filter-group span").text(
        response.length > 0 ? "Chọn nhóm" : "Không có nhóm"
      );
    },
    error: function () {
      Swal.fire({
        icon: "error",
        title: "Lỗi",
        text: "Không thể tải nhóm theo môn học!",
      });
    },
  });
}

// Load danh sách môn học và nhóm động
function loadSubjectsAndGroups() {
  const mahocky = $(".filter-semester.active").data("id");
  const namhoc = $(".filter-year.active").data("id");

  console.log("Loading filters - mahocky:", mahocky, "namhoc:", namhoc);

  if (!mahocky || !namhoc) {
    $("#dropdown-filter-subject, #dropdown-filter-group").prop(
      "disabled",
      true
    );
    $("#subject-menu, #group-menu").empty();
    console.log("Filters disabled due to missing mahocky or namhoc");
    return;
  }
  $("#group-menu").on("click", ".filter-group", function (e) {
    e.preventDefault();

    // Cập nhật chọn nhóm
    $(this).closest(".dropdown-menu").find(".active").removeClass("active");
    $(this).addClass("active");
    $(this).closest(".dropdown").find("span").text($(this).text());

    // Gọi lại thống kê cho nhóm được chọn
    getAggregatedStatictical();
  });

  $("#dropdown-filter-subject, #dropdown-filter-group").prop("disabled", false);

  $.ajax({
    type: "post",
    url: "/statistic/getFilters",
    data: { mahocky: mahocky, namhoc: namhoc },
    dataType: "json",
    success: function (response) {
      console.log("AJAX Response:", response);
      if (response.error) {
        Swal.fire({
          icon: "error",
          title: "Lỗi",
          text: response.error,
        });
        $("#subject-menu, #group-menu").empty();
        return;
      }

      $("#subject-menu").html(
        response.subjects.length > 0
          ? response.subjects
              .map(
                (subject) => `
                        <li><a class="dropdown-item filter-subject" href="javascript:void(0)" data-id="${subject.mamonhoc}">
                            ${subject.tenmonhoc}
                        </a></li>
                    `
              )
              .join("")
          : '<li><a class="dropdown-item" href="javascript:void(0)">Không có môn học</a></li>'
      );
      $("#dropdown-filter-subject").prop(
        "disabled",
        response.subjects.length === 0
      );
      $("#dropdown-filter-subject span").text(
        response.subjects.length > 0 ? "Chọn môn học" : "Không có môn học"
      );

      $("#group-menu").html(
        response.groups.length > 0
          ? response.groups
              .map(
                (group) => `
                        <li><a class="dropdown-item filter-group" href="javascript:void(0)" data-id="${group.manhom}">
                            ${group.tennhom}
                        </a></li>
                    `
              )
              .join("")
          : '<li><a class="dropdown-item" href="javascript:void(0)">Không có nhóm</a></li>'
      );
      $("#dropdown-filter-group").prop(
        "disabled",
        response.groups.length === 0
      );
      $("#dropdown-filter-group span").text(
        response.groups.length > 0 ? "Chọn nhóm" : "Không có nhóm"
      );

      getAggregatedStatictical();
    },
    error: function (xhr, status, error) {
      console.error("AJAX Error:", status, error);
      Swal.fire({
        icon: "error",
        title: "Lỗi",
        text: "Không thể tải danh sách môn học và nhóm!",
      });
      $("#subject-menu, #group-menu").empty();
      $("#dropdown-filter-subject, #dropdown-filter-group").prop(
        "disabled",
        true
      );
    },
  });
}

// Lấy thống kê tổng hợp
function getAggregatedStatictical() {
  const mahocky = $(".filter-semester.active").data("id");
  const namhoc = $(".filter-year.active").data("id");
  const mamonhoc = $(".filter-subject.active").data("id") || null;
  const manhom = $(".filter-group.active").data("id") || null;

  if (!mahocky || !namhoc) {
    Swal.fire({
      icon: "warning",
      title: "Chưa chọn bộ lọc",
      text: "Vui lòng chọn học kỳ và năm học để xem thống kê!",
    });
    return;
  }

  $.ajax({
    type: "post",
    url: "/statistic/getAggregatedStatistical",
    data: {
      mahocky: mahocky,
      namhoc: namhoc,
      mamonhoc: mamonhoc,
      manhom: manhom,
    },
    dataType: "json",
    success: function (response) {
      if (response.error) {
        Swal.fire({
          icon: "error",
          title: "Lỗi",
          text: response.error,
        });
        resetStats();
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
      $("#diem_cao_nhat").text(Math.min(response.diem_cao_nhat || 0, 10));

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
      resetStats();
      showChart([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    },
  });
}
// Hàm getStatictical và showChart giữ nguyên
function getStatictical() {
  const made = $("#chitietdethi").data("id");
  const manhom = $(".filtered-by-static.active").data("id") || 0;

  $.ajax({
    type: "post",
    url: "/statistic/getStatictical",
    data: { made: made, manhom: manhom },
    dataType: "json",
    success: function (response) {
      if (response.error) {
        Swal.fire({
          icon: "error",
          title: "Lỗi",
          text: response.error,
        });
        resetStats();
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
      $("#diem_cao_nhat").text(Math.min(response.diem_cao_nhat || 0, 10));

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
      resetStats();
      showChart([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    },
  });
}

function showChart(data) {
  if (!Array.isArray(data) || data.length === 0) {
    console.error("Dữ liệu không hợp lệ cho biểu đồ:", data);
    return;
  }

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
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--color-iris-bolt").trim(),
          borderColor: getComputedStyle(document.documentElement).getPropertyValue("--color-iris-bolt").trim(),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        title: {
          display: true,
          text: "Thống kê điểm thi",
          font: { size: 20, weight: "normal", family: "Inter" },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Số lượng sinh viên" },
        },
        x: {
          title: { display: true, text: "Khoảng điểm" },
        },
      },
    },
  });
}

// Reset giá trị thống kê
function resetStats() {
  $("#da_nop").text("0");
  $("#chua_nop").text("0");
  $("#khong_thi").text("0");
  $("#diem_trung_binh").text("0");
  $("#diem_duoi_1").text("0");
  $("#diem_duoi_5").text("0");
  $("#diem_lon_5").text("0");
  $("#diem_cao_nhat").text("0");
}
