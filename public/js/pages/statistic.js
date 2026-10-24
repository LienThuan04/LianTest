let filterGeneration = 0;
let groupGeneration = 0;
let aggregateGeneration = 0;
let detailGeneration = 0;
let statisticStatusMessage = "";
let filterStatusMessage = "";

$(document).ready(function () {
  if ($("#chitietdethi").length) {
    getStatictical();
    $(".filtered-by-static").click(function (e) {
      e.preventDefault();
      $(".filtered-by-static.active").removeClass("active");
      $(this).addClass("active");
      $("#dropdown-filter-static").text($(this).text().trim());
      getStatictical();
    });
    return;
  }

  $(".filter-year").click(function (e) {
    e.preventDefault();
    selectFilter($(this));
    matchSemestersToYear();
    loadSubjectsAndGroups();
  });

  $(".filter-semester").click(function (e) {
    e.preventDefault();
    if ($(this).prop("disabled")) return;
    selectFilter($(this));
    loadSubjectsAndGroups();
  });

  $("#subject-menu").on("click", ".filter-subject", function (e) {
    e.preventDefault();
    selectFilter($(this));
    loadGroupsBySubject();
    getAggregatedStatictical();
  });

  // Bind once: dependent menus are replaced whenever the period changes.
  $("#group-menu").on("click", ".filter-group", function (e) {
    e.preventDefault();
    selectFilter($(this));
    getAggregatedStatictical();
  });

  matchSemestersToYear();
  if (hasSelectedPeriod()) getAggregatedStatictical();
});

function selectFilter(option) {
  option.closest(".dropdown-menu").find(".active").removeClass("active");
  option.addClass("active");
  option.closest(".dropdown").find("span").text(option.text().trim());
}

function matchSemestersToYear() {
  const year = $(".filter-year.active").data("id");
  $(".filter-semester").each(function () {
    const matches = $(this).data("year") === year;
    $(this).prop("hidden", !matches).prop("disabled", !matches);
    $(this).closest("li").prop("hidden", !matches);
    if (!matches) $(this).removeClass("active");
  });
  const available = $(".filter-semester").filter(function () {
    return $(this).data("year") === year;
  });
  $("#dropdown-filter-semester").prop("disabled", available.length === 0);
  if (!$(".filter-semester.active").length && available.length) {
    selectFilter(available.first());
  }
  if (!available.length) {
    $("#dropdown-filter-semester span").text("Không có học kỳ");
  }
}

function hasSelectedPeriod() {
  return Boolean(
    $(".filter-semester.active").data("id") &&
    $(".filter-year.active").data("id")
  );
}

function setStatisticStatus(message) {
  statisticStatusMessage = message;
  renderStatisticStatus();
}

function setFilterStatus(message) {
  filterStatusMessage = message;
  renderStatisticStatus();
}

// Groups and statistics finish independently; neither result clears the other.
function renderStatisticStatus() {
  const message = [statisticStatusMessage, filterStatusMessage]
    .filter(Boolean).join(" ");
  $("#statistic-status").text(message).prop("hidden", !message);
}

function clearAggregateStatistics(message) {
  aggregateGeneration++;
  resetStats();
  if (window.myChart && typeof window.myChart.destroy === "function") {
    window.myChart.destroy();
    window.myChart = null;
  }
  setStatisticStatus(message);
}

function renderFilterMenu(kind, items, message) {
  const isSubject = kind === "subject";
  const allLabel = isSubject ? "Tất cả môn học" : "Tất cả nhóm";
  const emptyLabel = isSubject ? "Không có môn học" : "Không có nhóm";
  const menu = $("#" + kind + "-menu").empty();
  const label = items.length ? allLabel : message || emptyLabel;
  $("#dropdown-filter-" + kind).prop("disabled", items.length === 0);
  $("#dropdown-filter-" + kind + " span").text(label);

  if (!items.length) {
    menu.append(
      $("<li>").append($("<span>").addClass("dropdown-item-text").text(label))
    );
    return;
  }

  function appendOption(id, text, active) {
    const button = $("<button>")
      .attr("type", "button")
      .attr("data-id", id)
      .addClass("dropdown-item filter-" + kind)
      .text(text);
    if (active) button.addClass("active");
    menu.append($("<li>").append(button));
  }
  appendOption("", allLabel, true);
  items.forEach(function (item) {
    appendOption(
      isSubject ? item.mamonhoc : item.manhom,
      isSubject ? item.tenmonhoc : item.tennhom,
      false
    );
  });
}

function loadGroupsBySubject() {
  const generation = ++groupGeneration;
  setFilterStatus("");
  const mahocky = $(".filter-semester.active").data("id");
  const namhoc = $(".filter-year.active").data("id");
  const mamonhoc = $(".filter-subject.active").data("id") || null;
  renderFilterMenu("group", [], "Đang tải nhóm...");
  if (!hasSelectedPeriod()) {
    renderFilterMenu("group", []);
    return;
  }

  $.ajax({
    type: "post",
    url: mamonhoc ? "/statistic/getGroupsBySubject" : "/statistic/getFilters",
    data: mamonhoc ? { mahocky, namhoc, mamonhoc } : { mahocky, namhoc },
    dataType: "json",
    success: function (response) {
      if (generation !== groupGeneration) return;
      const groups = mamonhoc ? response : response.groups;
      if (response.error || !Array.isArray(groups)) {
        failGroups(response.error);
        return;
      }
      renderFilterMenu("group", groups);
      setFilterStatus(groups.length
        ? "" : "Không có nhóm cho môn học và học kỳ đã chọn.");
    },
    error: function () {
      if (generation !== groupGeneration) return;
      failGroups();
    },
  });

  function failGroups(error) {
    const message = error ||
      "Không thể tải danh sách nhóm. Vui lòng chọn lại môn học để thử lại.";
    renderFilterMenu("group", [], "Không thể tải nhóm");
    setFilterStatus(message);
  }
}

// A period change invalidates both its menus and any in-flight statistics.
function loadSubjectsAndGroups() {
  const generation = ++filterGeneration;
  groupGeneration++;
  setFilterStatus("");
  clearAggregateStatistics("Đang tải bộ lọc thống kê...");
  renderFilterMenu("subject", [], "Đang tải môn học...");
  renderFilterMenu("group", [], "Đang tải nhóm...");
  if (!hasSelectedPeriod()) {
    renderFilterMenu("subject", []);
    renderFilterMenu("group", []);
    setStatisticStatus("Chưa có học kỳ và năm học để xem thống kê.");
    return;
  }
  const mahocky = $(".filter-semester.active").data("id");
  const namhoc = $(".filter-year.active").data("id");

  $.ajax({
    type: "post",
    url: "/statistic/getFilters",
    data: { mahocky, namhoc },
    dataType: "json",
    success: function (response) {
      if (generation !== filterGeneration) return;
      if (response.error || !Array.isArray(response.subjects) ||
          !Array.isArray(response.groups)) {
        failFilters(response.error);
        return;
      }
      renderFilterMenu("subject", response.subjects);
      renderFilterMenu("group", response.groups);
      getAggregatedStatictical();
      if (!response.subjects.length || !response.groups.length) {
        setFilterStatus(
          "Không có môn học hoặc nhóm cho học kỳ và năm học đã chọn."
        );
      }
    },
    error: function () {
      if (generation !== filterGeneration) return;
      failFilters();
    },
  });

  function failFilters(error) {
    renderFilterMenu("subject", [], "Không thể tải môn học");
    renderFilterMenu("group", [], "Không thể tải nhóm");
    setStatisticStatus(error ||
      "Không thể tải bộ lọc thống kê. Vui lòng chọn lại học kỳ hoặc năm học để thử lại."
    );
  }
}

// Lấy thống kê tổng hợp
function getAggregatedStatictical() {
  const mahocky = $(".filter-semester.active").data("id");
  const namhoc = $(".filter-year.active").data("id");
  const mamonhoc = $(".filter-subject.active").data("id") || null;
  const manhom = $(".filter-group.active").data("id") || null;

  if (!mahocky || !namhoc) {
    clearAggregateStatistics("Chưa có học kỳ và năm học để xem thống kê.");
    return;
  }

  clearAggregateStatistics("Đang tải thống kê...");
  const generation = aggregateGeneration;
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
      if (generation !== aggregateGeneration) return;
      if (response.error) {
        setStatisticStatus(response.error);
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
      setStatisticStatus(
        response.da_nop_bai || response.chua_nop_bai || response.khong_thi
          ? ""
          : "Chưa có kết quả thống kê cho bộ lọc đã chọn."
      );
    },
    error: function () {
      if (generation !== aggregateGeneration) return;
      setStatisticStatus(
        "Không thể tải thống kê. Vui lòng chọn lại bộ lọc để thử lại."
      );
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
function getStatictical() {
  const generation = ++detailGeneration;
  const made = $("#chitietdethi").data("id");
  const manhom = $(".filtered-by-static.active").data("id") || 0;

  $.ajax({
    type: "post",
    url: "/statistic/getStatictical",
    data: { made: made, manhom: manhom },
    dataType: "json",
    success: function (response) {
      if (generation !== detailGeneration) return;
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
      if (generation !== detailGeneration) return;
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

  if (typeof Chart !== "function") return;
  const canvas = document.getElementById("myChart");
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const labels = data.map((_, i) => (i === 9 ? `9-10` : `${i}-${i + 1}`));

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
