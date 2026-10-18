Dashmix.helpersOnLoad(["js-flatpickr", "jq-datepicker", "jq-select2"]);

let groups = [];
let isSubmitting = false;
let pointToastTimeout = null;

function getSelectedQuestionTypes() {
  let types = [];
  $(".dang-hoi:checked").each(function () {
    let val = $(this).val();
    // Chuẩn hóa về key backend: mcq, essay, reading (hoặc tracnghiem, tuluan, dochieu)
    if (val === "mcq" || val === "tracnghiem") types.push("mcq");
    else if (val === "essay" || val === "tuluan") types.push("essay");
    else if (val === "reading" || val === "dochieu") types.push("reading");
  });
  return types;
}
function getTotalQuestionOfChapter(chapters, monhoc, dokho, loaicauhoi) {
  console.log("➡️ DATA GỬI SANG PHP:", {
    chuong: Array.isArray(chapters) ? chapters : [chapters].filter(Boolean),
    monhoc: monhoc,
    dokho: dokho,
    loaicauhoi: loaicauhoi,
  });

  var result = 0;
  if (!loaicauhoi || loaicauhoi.length === 0) return 0;

  $.ajax({
    url: "/question/getsoluongcauhoi",
    type: "post",
    data: {
      chuong: Array.isArray(chapters) ? chapters : [chapters].filter(Boolean),
      monhoc: monhoc,
      dokho: dokho,
      loaicauhoi: loaicauhoi,
    },
    async: false,
    success: function (response) {
      if (response && response.success && response.data) {
        loaicauhoi.forEach(function (lc) {
          if (response.data[lc]) {
            switch (dokho) {
              case 1:
                result += response.data[lc].de;
                break;
              case 2:
                result += response.data[lc].tb;
                break;
              case 3:
                result += response.data[lc].kho;
                break;
            }
          }
        });
      } else {
        console.warn("Server không trả về data hợp lệ:", response);
      }
    },
    error: function (xhr, status, error) {
      console.error("Lỗi AJAX:", error, xhr.responseText);
    },
  });

  return result;
}

function updateQuestionCounts() {
  let chapters = getSelectedChapters();
  let m = $("#nhom-hp").val() ? groups[$("#nhom-hp").val()].mamonhoc : 0;
  let isAuto = $("#tudongsoande").prop("checked");

  // Kiểm tra cho cả đề thủ công và tự động
  if (chapters.length === 0 || !m) {
    $("#coban").val(0);
    $("#trungbinh").val(0);
    $("#kho").val(0);
    $("#coban-error").text("Vui lòng chọn chương và môn học");
    $("#trungbinh-error").text("Vui lòng chọn chương và môn học");
    $("#kho-error").text("Vui lòng chọn chương và môn học");
    return;
  }

  let availableEasy = getTotalQuestionOfChapter(chapters, m, 1);
  let availableMedium = getTotalQuestionOfChapter(chapters, m, 2);
  let availableHard = getTotalQuestionOfChapter(chapters, m, 3);

  $("#coban-error").text(`Có ${availableEasy} câu dễ`);
  $("#trungbinh-error").text(`Có ${availableMedium} câu trung bình`);
  $("#kho-error").text(`Có ${availableHard} câu khó`);

  jQuery(".form-taodethi").valid();
}
$.validator.addMethod(
  "validSoLuong",
  function (value, element, param) {
    let chapters = getSelectedChapters();
    let m = $("#nhom-hp").val() ? groups[$("#nhom-hp").val()].mamonhoc : 0;
    let parsedValue = parseFloat(value);

    if (parsedValue < 0) {
      return false;
    }
    if (parsedValue % 1 !== 0) {
      return false;
    }

    // Kiểm tra số lượng câu hỏi cho cả đề thủ công và tự động
    let result = getToTalQuestionOfChapter(chapters, m, param);
    console.log(`Validating: Value=${value}, Result=${result}, Dokho=${param}`);
    return result >= parseInt(value);
  },
  function (params, element) {
    let value = parseFloat($(element).val());
    if (value < 0) {
      return "Số câu hỏi không được âm";
    }
    if (value % 1 !== 0) {
      return "Số câu hỏi phải là số nguyên";
    }
    let chapters = getSelectedChapters();
    let m = $("#nhom-hp").val() ? groups[$("#nhom-hp").val()].mamonhoc : 0;
    let result = getToTalQuestionOfChapter(chapters, m, params);
    return `Chỉ có ${result} câu hỏi mức độ ${
      params == 1 ? "dễ" : params == 2 ? "trung bình" : "khó"
    }, bạn yêu cầu ${$(element).val()} câu`;
  }
);
function getMinutesBetweenDates(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.round(diffMs / 60000);
}

function showPointRequiredToast(typeName) {
  // Xóa toast cũ nếu đang hiện
  $("#point-required-toast").remove();
  clearTimeout(pointToastTimeout);

  const toastHtml = `
    <div id="point-required-toast" class="position-fixed" style="top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999;">
      <div class="alert alert-warning d-flex align-items-center shadow-lg border-0" role="alert" style="border-radius: 12px; min-width: 300px;">
        <i class="fa fa-exclamation-circle fa-2x me-3 text-warning"></i>
        <div>
          <strong>Vui lòng nhập điểm</strong><br>
          cho phần <strong class="text-primary">${typeName}</strong>
        </div>
      </div>
    </div>
  `;

  $("body").append(toastHtml);

  // Tự ẩn sau 3 giây
  pointToastTimeout = setTimeout(() => {
    $("#point-required-toast").fadeOut(300, function () {
      $(this).remove();
    });
  }, 3000);
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
          " - " +
          "(" +
          item.tennamhoc +
          ")" +
          " - " +
          item.tenhocky
        }</option>`;
      });
      $("#nhom-hp").html(html);
    },
  });
}
$("#nhom-hp").on("change", function () {
  let index = $(this).val();
  let mamonhoc = groups[index].mamonhoc;
  showListGroup(index);
  showChapter(mamonhoc);
});

function showChapter(mamonhoc) {
  let html = `
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="select-all-chapters">
      <label class="form-check-label fw-semibold" for="select-all-chapters">
        <i class="me-1 text-success"></i> Chọn tất cả chương
      </label>
    </div>`;

  $.ajax({
    type: "post",
    url: "/subject/getAllChapter",
    async: false,
    data: { mamonhoc: mamonhoc },
    dataType: "json",
    success: function (data) {
      data.forEach((item) => {
        html += `
          <div class="form-check">
            <input class="form-check-input select-chapter-item" type="checkbox"
              value="${item.machuong}" id="chuong-${item.machuong}">
            <label class="form-check-label" for="chuong-${item.machuong}">
              ${item.tenchuong}
            </label>
          </div>`;
      });
      $("#chuong").html(html);
    },
  });
}

$(document).on("click", "#select-all-chapters", function () {
  let check = $(this).prop("checked");
  $(".select-chapter-item").prop("checked", check);
  updateQuestionCounts();
});

function getSelectedChapters() {
  let result = [];
  $(".select-chapter-item").each(function () {
    if ($(this).prop("checked")) {
      result.push($(this).val());
    }
  });
  return result;
}
function showListGroup(index) {
  let html = "";
  if (groups[index] && groups[index].nhom.length > 0) {
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

function getGroupSelected() {
  let result = [];
  $(".select-group-item").each(function () {
    if ($(this).prop("checked")) {
      result.push($(this).val());
    }
  });
  return result;
}

Dashmix.onLoad(() =>
  class {
    static initValidation() {
      Dashmix.helpers("jq-validation");
      $.validator.addMethod(
        "validTimeEnd",
        function (value) {
          var startTime = new Date($("#time-start").val());
          var currentTime = new Date();
          var endTime = new Date(value);
          return endTime > startTime && endTime > currentTime;
        },
        "Thời gian kết thúc phải lớn hơn thời gian bắt đầu và không bé hơn thời gian hiện tại"
      );
      $.validator.addMethod(
        "atLeastOneQuestion",
        function () {
          const easy = parseInt($("#coban").val()) || 0;
          const medium = parseInt($("#trungbinh").val()) || 0;
          const hard = parseInt($("#kho").val()) || 0;
          return easy + medium + hard > 0;
        },
        "Phải có ít nhất 1 câu hỏi."
      );

      $.validator.addMethod(
        "validTimeStart",
        function (value) {
          var startTime = new Date(value);
          var currentTime = new Date();
          return startTime > currentTime;
        },
        "Thời gian bắt đầu không được bé hơn thời gian hiện tại"
      );

      $.validator.addMethod(
        "validThoigianthi",
        function (value) {
          let minutes = parseInt(value);
          if (isNaN(minutes) || minutes <= 0) return false; // check lớn hơn 0

          let startTime = new Date($("#time-start").val());
          let endTime = new Date($("#time-end").val());
          let totalMinutes = getMinutesBetweenDates(startTime, endTime);

          return startTime < endTime && totalMinutes >= minutes;
        },
        "Thời gian làm bài phải lớn hơn 0 và nhỏ hơn tổng thời gian giữa bắt đầu và kết thúc"
      );
      $.validator.addMethod(
        "validTotalScore",
        function (value, element) {
          const mcq =
            parseFloat($("#diem_tracnghiem").val().replace(",", ".")) || 0;
          const essay =
            parseFloat($("#diem_tuluan").val().replace(",", ".")) || 0;
          const reading =
            parseFloat($("#diem_dochieu").val().replace(",", ".")) || 0;
          const total = mcq + essay + reading;

          // Xóa thông báo cũ
          $("#total-score-toast").remove();

          if (total > 10) {
            const toast = `
        <div id="total-score-toast" 
             class="position-fixed" 
             style="top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; width: auto;">
          <div class="alert alert-danger d-flex align-items-center mb-0 shadow-sm" role="alert"
               style="border-radius: 8px;">
            <i class="fa fa-exclamation-triangle me-2"></i>
            <span>
             Điểm hiện tại là <strong>${total.toFixed(
               2
             )}</strong> Vượt quá điểm <strong>10</strong>
            </span>
          </div>
        </div>
      `;

            $("body").append(toast);

            // Ẩn sau 3 giây
            setTimeout(() => {
              $("#total-score-toast").remove();
            }, 3000);

            return false;
          }

          return true;
        },
        function () {
          return "";
        }
      );

      jQuery(".form-taodethi").validate({
        // ===== QUAN TRỌNG: Dynamic rules cho điểm theo checkbox =====
        rules: {
          "name-exam": { required: true },
          "time-start": { required: true, validTimeStart: true },
          "time-end": { required: true, validTimeEnd: true },
          "exam-time": { required: true, digits: true, validThoigianthi: true },
          "nhom-hp": { required: true },
          user_nhomquyen: { required: true },

          // ĐIỂM CHỈ BẮT BUỘC KHI LOẠI CÂU HỎI ĐƯỢC CHỌN
          // 1. XÓA HOÀN TOÀN rule "required" của 3 ô điểm (đây là nguyên nhân chính!)
          diem_tracnghiem: {
            // required: function() { return $("#loai-tracnghiem").is(":checked"); },  ← XÓA DÒNG NÀY
            number: true,
            min: function () {
              return $("#loai-tracnghiem").is(":checked") ? 0.01 : 0;
            },
            validTotalScore: true,
          },
          diem_tuluan: {
            number: true,
            min: function () {
              return $("#loai-tuluan").is(":checked") ? 0.01 : 0;
            },
            validTotalScore: true,
          },
          diem_dochieu: {
            number: true,
            min: function () {
              return $("#loai-doc-hieu").is(":checked") ? 0.01 : 0;
            },
            validTotalScore: true,
          },
          chuong: {
            required: function () {
              return getSelectedChapters().length > 0;
            },
          },
          coban: {
            required: true,
            digits: true,
            validSoLuong: 1,
            atLeastOneQuestion: true,
          },
          trungbinh: {
            required: true,
            digits: true,
            validSoLuong: 2,
            atLeastOneQuestion: true,
          },
          kho: {
            required: true,
            digits: true,
            validSoLuong: 3,
            atLeastOneQuestion: true,
          },
        },

        messages: {
          "name-exam": { required: "Vui lòng nhập tên đề kiểm tra" },
          "time-start": {
            required: "Vui lòng chọn thời điểm bắt đầu",
            validTimeStart: "Thời gian bắt đầu không được nhỏ hơn hiện tại",
          },
          "time-end": {
            required: "Vui lòng chọn thời điểm kết thúc",
            validTimeEnd: "Thời gian kết thúc không hợp lệ",
          },
          "exam-time": { required: "Vui lòng nhập thời gian làm bài" },
          "nhom-hp": { required: "Vui lòng chọn nhóm học phần" },

          diem_tracnghiem: {
            min: "Điểm phải lớn hơn 0",
          },
          diem_tuluan: {
            min: "Điểm phải lớn hơn 0",
          },
          diem_dochieu: {
            min: "Điểm phải lớn hơn 0",
          },
        },

        // ===== ẨN LỖI ĐIỂM KHI CHƯA BẤM LƯU (vẫn giữ nguyên logic cũ) =====
        showErrors: function (errorMap, errorList) {
          if (!isSubmitting) {
            errorList = errorList.filter((item) => {
              const id = item.element.id || "";
              return ![
                "diem_tracnghiem",
                "diem_tuluan",
                "diem_dochieu",
              ].includes(id);
            });

            $("#diem_tracnghiem, #diem_tuluan, #diem_dochieu")
              .removeClass("is-invalid is-valid")
              .closest(".form-group, .col-md-4, .input-group")
              .find(".invalid-feedback, .valid-feedback")
              .remove();
          }
          this.defaultShowErrors();
        },

        // Trigger validate lại khi thay đổi checkbox loại câu hỏi
        invalidHandler: function () {
          isSubmitting = false;
        },
      });
    }
    static init() {
      this.initValidation();
    }
  }.init()
);
$(document).on(
  "input change",
  "#diem_tracnghiem, #diem_tuluan, #diem_dochieu",
  function () {
    // Validate lại toàn form → rule validTotalScore sẽ được kiểm tra
    $(".form-taodethi").valid();
  }
);

$(document).ready(function () {
  // Xử lý cắt URL để lấy mã đề thi
  let url = location.href.split("/");
  let param = url[url.length - 2] == "update" ? url[url.length - 1] : 0;
  if (param) {
    getDetail(param);
  }

  // Sự kiện thay đổi nhóm học phần
  $("#nhom-hp").on("select2:select", function () {
    let index = $(this).val();
    if (index && groups[index]) {
      let mamonhoc = groups[index].mamonhoc;
      showListGroup(index);
      showChapter(mamonhoc);
      updateQuestionCounts();
    }
  });

  // Sự kiện thay đổi chương
  $("#chuong").on("select2:select", function () {
    updateQuestionCounts();
  });

  $("#tudongsoande").on("change", function () {
    $(".show-chap").toggle();
    if (!$(this).prop("checked")) {
      $("#chuong").val("").trigger("change");
      $("#coban").val(0);
      $("#trungbinh").val(0);
      $("#kho").val(0);
    }
    updateQuestionCounts();
  });

  // Sự kiện thay đổi các checkbox khác
  $("#xemdiem, #xemda, #xembailam, #daocauhoi, #daodapan, #tudongnop").on(
    "change",
    function () {
      updateQuestionCounts();
    }
  );

  // Chọn hoặc bỏ chọn tất cả nhóm
  $(document).on("click", "#select-all-group", function () {
    let check = $(this).prop("checked");
    $(".select-group-item").prop("checked", check);
  });

  function tinhTongDiem() {
    const tn = parseFloat($("#diem_tracnghiem").val().replace(",", ".")) || 0;
    const tl = parseFloat($("#diem_tuluan").val().replace(",", ".")) || 0;
    const dh = parseFloat($("#diem_dochieu").val().replace(",", ".")) || 0;
    return Math.round((tn + tl + dh) * 100) / 100;
  }
  // Xử lý nút tạo đề
  $("#btn-add-test")
    .off("click")
    .on("click", function (e) {
      e.preventDefault();
      isSubmitting = true;

      // Form validation cũ
      if (!$(".form-taodethi").valid()) {
        isSubmitting = false;
        return;
      }

      const totalScore = tinhTongDiem();
      if (totalScore !== 10) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "",
          message: `
        Tổng điểm phải đúng <strong class="text-danger">10 điểm</strong>! <br>
        Hiện tại đang là <strong class="text-primary">${totalScore.toFixed(
          2
        )}</strong> điểm.
 
  `,
          delay: 8000,
        });

        return;
      }

      if (!validUpdate()) {
        return;
      }

      let chapters = getSelectedChapters();
      let selectedGroups = getGroupSelected();
      let m = $("#nhom-hp").val() ? groups[$("#nhom-hp").val()].mamonhoc : 0;
      let questionTypes = getSelectedQuestionTypes();

      if (questionTypes.length === 0) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          message: "Phải chọn ít nhất 1 loại câu hỏi!",
        });
        return;
      }
      if (selectedGroups.length === 0) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          message: "Chọn ít nhất một nhóm học phần!",
        });
        return;
      }

      // Kiểm tra điểm > 0 nếu loại được bật
      if (
        $("#loai-tracnghiem").is(":checked") &&
        (parseFloat($("#diem_tracnghiem").val()) || 0) <= 0
      ) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          message: "Loại Trắc nghiệm phải có điểm > 0!",
        });
        return;
      }
      if (
        $("#loai-tuluan").is(":checked") &&
        (parseFloat($("#diem_tuluan").val()) || 0) <= 0
      ) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          message: "Loại Tự luận phải có điểm > 0!",
        });
        return;
      }
      if (
        $("#loai-doc-hieu").is(":checked") &&
        (parseFloat($("#diem_dochieu").val()) || 0) <= 0
      ) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          message: "Loại Đọc hiểu phải có điểm > 0!",
        });
        return;
      }

      const typeMap = {
        mcq: "tracnghiem",
        essay: "tuluan",
        reading: "dochieu",
      };
      const typeNameMap = {
        mcq: "Trắc nghiệm",
        essay: "Tự luận",
        reading: "Đọc hiểu",
      };

      const socau = {};
      const diem = {};
      let valid = true;

      questionTypes.forEach((type) => {
        const prefix = typeMap[type];
        const de = parseInt($(`#coban_${prefix}`).val()) || 0;
        const tb = parseInt($(`#trungbinh_${prefix}`).val()) || 0;
        const kho = parseInt($(`#kho_${prefix}`).val()) || 0;
        const point =
          parseFloat($(`#diem_${prefix}`).val().replace(",", ".")) || 0;

        if (de + tb + kho === 0) {
          valid = false;
          Dashmix.helpers("jq-notify", {
            type: "danger",
            message: `Loại "${typeNameMap[type]}" phải có ít nhất 1 câu!`,
          });
        }
        if (point <= 0) {
          valid = false;
          Dashmix.helpers("jq-notify", {
            type: "danger",
            message: `Loại "${typeNameMap[type]}" phải có điểm > 0!`,
          });
        }

        socau[type] = { de, tb, kho };
        diem[type] = point;
      });
      if (!valid) return;

      // Kiểm tra số lượng câu trong ngân hàng
      questionTypes.forEach((type) => {
        const prefix = typeMap[type];
        const tenLoai = typeNameMap[type];
        const required = socau[type];
        const available = {
          de: getTotalQuestionOfChapter(chapters, m, 1, [type]),
          tb: getTotalQuestionOfChapter(chapters, m, 2, [type]),
          kho: getTotalQuestionOfChapter(chapters, m, 3, [type]),
        };

        if (available.de < required.de)
          (valid = false),
            Dashmix.helpers("jq-notify", {
              type: "danger",
              message: `${tenLoai}: chỉ có ${available.de} câu dễ, cần ${required.de}`,
            });
        if (available.tb < required.tb)
          (valid = false),
            Dashmix.helpers("jq-notify", {
              type: "danger",
              message: `${tenLoai}: chỉ có ${available.tb} câu trung bình, cần ${required.tb}`,
            });
        if (available.kho < required.kho)
          (valid = false),
            Dashmix.helpers("jq-notify", {
              type: "danger",
              message: `${tenLoai}: chỉ có ${available.kho} câu khó, cần ${required.kho}`,
            });
      });
      if (!valid) return;

      // Gửi AJAX tạo đề
      const ajaxData = {
        mamonhoc: m,
        tende: $("#name-exam").val(),
        thoigianthi: parseInt($("#exam-time").val()) || 0,
        thoigianbatdau: $("#time-start").val(),
        thoigianketthuc: $("#time-end").val(),
        socau: JSON.stringify(socau),
        diem_tracnghiem: diem.mcq || 0,
        diem_tuluan: diem.essay || 0,
        diem_dochieu: diem.reading || 0,
        chuong: chapters,
        loaide: $("#tudongsoande").prop("checked") ? 1 : 0,
        xemdiem: $("#xemdiem").prop("checked") ? 1 : 0,
        xemdapan: $("#xemda").prop("checked") ? 1 : 0,
        xembailam: $("#xembailam").prop("checked") ? 1 : 0,
        daocauhoi: $("#daocauhoi").prop("checked") ? 1 : 0,
        daodapan: $("#daodapan").prop("checked") ? 1 : 0,
        tudongnop: $("#tudongnop").prop("checked") ? 1 : 0,
        manhom: selectedGroups,
        loaicauhoi: questionTypes,
      };

      // Log dữ liệu ra console
      console.log("AJAX data to send (object):", ajaxData);
      console.log(
        "AJAX data to send (JSON):",
        JSON.stringify(ajaxData, null, 2)
      );
      //return; // <- dừng tại đây, không gửi AJAX

      $.ajax({
        url: "/test/addTest",
        type: "post",
        data: {
          mamonhoc: m,
          tende: $("#name-exam").val(),
          thoigianthi: parseInt($("#exam-time").val()) || 0,
          thoigianbatdau: $("#time-start").val(),
          thoigianketthuc: $("#time-end").val(),
          socau: JSON.stringify(socau),
          diem_tracnghiem: diem.mcq || 0,
          diem_tuluan: diem.essay || 0,
          diem_dochieu: diem.reading || 0,
          chuong: chapters,
          loaide: $("#tudongsoande").prop("checked") ? 1 : 0,
          xemdiem: $("#xemdiem").prop("checked") ? 1 : 0,
          xemdapan: $("#xemda").prop("checked") ? 1 : 0,
          xembailam: $("#xembailam").prop("checked") ? 1 : 0,
          daocauhoi: $("#daocauhoi").prop("checked") ? 1 : 0,
          daodapan: $("#daodapan").prop("checked") ? 1 : 0,
          tudongnop: $("#tudongnop").prop("checked") ? 1 : 0,
          manhom: selectedGroups,
          loaicauhoi: questionTypes,
        },

        dataType: "json",
        success: function (res) {
          if (res.success && res.made) {
            Dashmix.helpers("jq-notify", {
              type: "success",
              message: "Tạo đề thi thành công!",
            });

            // Lấy loại đề vừa tạo
            const loaide = $("#tudongsoande").prop("checked") ? 1 : 0;

            setTimeout(() => {
              if (loaide === 0) {
                // Đề thủ công → chuyển sang trang chọn câu hỏi
                location.href = `/test/select/${res.made}`;
              } else {
                // Đề tự động → về danh sách đề
                location.href = "/test";
              }
            }, 1500);
          } else {
            Dashmix.helpers("jq-notify", {
              type: "danger",
              message: res.error || "Tạo đề thất bại!",
            });
          }
        },
        error: function () {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            message: "Lỗi hệ thống!",
          });
        },
      });
    });

  $("#btn-update-test")
    .off("click")
    .on("click", function (e) {
      e.preventDefault();
      isSubmitting = true;
      if (!$(".form-taodethi").valid()) {
        isSubmitting = false;
        Dashmix.helpers("jq-notify", {
          type: "warning",
          icon: "fa fa-exclamation-triangle me-1",
          message: "Vui lòng kiểm tra lại các trường bắt buộc!",
        });
        return;
      }

      const totalScore = tinhTongDiem();
      if (totalScore !== 10) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "",
          message: `
        Tổng điểm phải đúng <strong class="text-danger">10 điểm</strong>! <br>
        Hiện tại đang là <strong class="text-primary">${totalScore.toFixed(
          2
        )}</strong> điểm.
 
  `,
          delay: 8000,
        });

        return;
      }

      if (!validUpdate()) {
        return;
      }

      const loaide = $("#tudongsoande").prop("checked") ? 1 : 0;
      const manhom = getGroupSelected().map((x) => parseInt(x));
      const loaicauhoi = getSelectedQuestionTypes();
      const chapters = getSelectedChapters();
      const m = groups[$("#nhom-hp").val()].mamonhoc;

      if (manhom.length === 0) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          message: "Chọn ít nhất một nhóm học phần!",
        });
        return;
      }
      if (loaicauhoi.length === 0) {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          message: "Phải chọn ít nhất 1 loại câu hỏi!",
        });
        return;
      }

      const typeMap = {
        mcq: "tracnghiem",
        essay: "tuluan",
        reading: "dochieu",
      };
      const typeNameMap = {
        mcq: "Trắc nghiệm",
        essay: "Tự luận",
        reading: "Đọc hiểu",
      };

      const socau = {};
      const diem = {};
      let valid = true;

      loaicauhoi.forEach((type) => {
        const prefix = typeMap[type];
        const de = parseInt($(`#coban_${prefix}`).val()) || 0;
        const tb = parseInt($(`#trungbinh_${prefix}`).val()) || 0;
        const kho = parseInt($(`#kho_${prefix}`).val()) || 0;
        const point =
          parseFloat($(`#diem_${prefix}`).val().replace(",", ".")) || 0;

        if (de + tb + kho === 0) {
          valid = false;
          Dashmix.helpers("jq-notify", {
            type: "danger",
            message: `Loại "${typeNameMap[type]}" phải có ít nhất 1 câu!`,
          });
        }
        if (point <= 0) {
          valid = false;
          Dashmix.helpers("jq-notify", {
            type: "danger",
            message: `Loại "${typeNameMap[type]}" phải có điểm > 0!`,
          });
        }

        socau[type] = { de, tb, kho };
        diem[type] = point;
      });

      if (!valid) return;

      // Kiểm tra số lượng câu hỏi trong ngân hàng
      loaicauhoi.forEach((type) => {
        const tenLoai = typeNameMap[type];
        const required = socau[type];
        const available = {
          de: getTotalQuestionOfChapter(chapters, m, 1, [type]),
          tb: getTotalQuestionOfChapter(chapters, m, 2, [type]),
          kho: getTotalQuestionOfChapter(chapters, m, 3, [type]),
        };

        if (available.de < required.de)
          (valid = false),
            Dashmix.helpers("jq-notify", {
              type: "danger",
              message: `${tenLoai}: chỉ có ${available.de} câu dễ, bạn cần ${required.de}`,
            });
        if (available.tb < required.tb)
          (valid = false),
            Dashmix.helpers("jq-notify", {
              type: "danger",
              message: `${tenLoai}: chỉ có ${available.tb} câu trung bình, bạn cần ${required.tb}`,
            });
        if (available.kho < required.kho)
          (valid = false),
            Dashmix.helpers("jq-notify", {
              type: "danger",
              message: `${tenLoai}: chỉ có ${available.kho} câu khó, bạn cần ${required.kho}`,
            });
      });

      if (!valid) return;

      // === GỬI DỮ LIỆU CẬP NHẬT ===
      const data = {
        made: infodethi.made,
        mamonhoc: m,
        tende: $("#name-exam").val(),
        thoigianthi: parseInt($("#exam-time").val()) || 0,
        thoigianbatdau: $("#time-start").val(),
        thoigianketthuc: $("#time-end").val(),
        chuong: chapters,
        loaide: loaide,
        xemdiem: $("#xemdiem").prop("checked") ? 1 : 0,
        xemdapan: $("#xemda").prop("checked") ? 1 : 0,
        xembailam: $("#xembailam").prop("checked") ? 1 : 0,
        daocauhoi: $("#daocauhoi").prop("checked") ? 1 : 0,
        daodapan: $("#daodapan").prop("checked") ? 1 : 0,
        tudongnop: $("#tudongnop").prop("checked") ? 1 : 0,
        manhom: manhom,
        socau: JSON.stringify(socau),
        loaicauhoi: loaicauhoi,
        diem_tracnghiem: diem.mcq || 0,
        diem_tuluan: diem.essay || 0,
        diem_dochieu: diem.reading || 0,
      };

      $.ajax({
        type: "post",
        url: "/test/updateTest",
        data: data,
        dataType: "json",
        success: function (response) {
          if (response && response.success) {
            Dashmix.helpers("jq-notify", {
              type: "success",
              icon: "fa fa-check me-1",
              message: "Cập nhật đề thi thành",
            });
            setTimeout(() => (location.href = "/test"), 1500);
          } else {
            Dashmix.helpers("jq-notify", {
              type: "danger",
              message: response.error || "Cập nhật đề thi không thành công!",
              delay: 10000,
            });
          }
        },
        error: function (xhr) {
          let msg = "Lỗi hệ thống!";

          try {
            const res = JSON.parse(xhr.responseText);
            if (res.error) msg = res.error;
          } catch (e) {}

          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-exclamation-triangle me-1",
            message: msg,
            close: true,
            timeout: 5000,
          });
        },
      });
    });
  //load điểm mỗi câu
  // Tính và hiển thị điểm mỗi câu (cập nhật realtime)
  function capNhatDiemMoiCau() {
    const types = [
      { prefix: "tracnghiem", display: "#diem-moi-cau-tn" },
      { prefix: "tuluan", display: "#diem-moi-cau-tl" },
      { prefix: "dochieu", display: "#diem-moi-cau-dh" },
    ];

    types.forEach((t) => {
      const de = parseInt($(`#coban_${t.prefix}`).val()) || 0;
      const tb = parseInt($(`#trungbinh_${t.prefix}`).val()) || 0;
      const kho = parseInt($(`#kho_${t.prefix}`).val()) || 0;
      const tongCau = de + tb + kho;

      const diemTong =
        parseFloat($(`#diem_${t.prefix}`).val().replace(",", ".")) || 0;

      let diemMoi = 0;
      if (tongCau > 0 && diemTong > 0) {
        diemMoi = diemTong / tongCau;
        diemMoi = Math.round(diemMoi * 1000) / 1000; // làm tròn 3 chữ số
      }

      // Hiển thị đẹp
      $(t.display).html(`
            Mỗi câu: <span class="text-danger fw-bold">${diemMoi
              .toFixed(3)
              .replace(/0+$/, "")
              .replace(/\.$/, "")}</span> điểm
        `);
    });

    // Trigger validate tổng điểm
    // $(".form-taodethi").valid();
  }

  // Gọi khi thay đổi bất kỳ input nào liên quan
  $(document).on(
    "input change",
    "input[id^='coban_'], input[id^='trungbinh_'], input[id^='kho_'], #diem_tracnghiem, #diem_tuluan, #diem_dochieu",
    capNhatDiemMoiCau
  );

  $(document).ready(function () {
    setTimeout(capNhatDiemMoiCau, 500);
  });
  function checkDate(time) {
    let dateToCompare = new Date(time);
    let currentTime = new Date();
    return dateToCompare.getTime() < currentTime.getTime();
  }
  // Hiển thị/ẩn div socau-type dựa theo checkbox
  function toggleSocauType() {
    $(".dang-hoi").each(function () {
      const val = $(this).val(); // mcq / essay / reading
      let targetId = "";
      if (val === "mcq") targetId = "#box-tn";
      else if (val === "essay") targetId = "#box-tl";
      else if (val === "reading") targetId = "#box-dh";

      if ($(this).prop("checked")) {
        $(targetId).removeClass("d-none");
      } else {
        $(targetId).addClass("d-none");
        $(targetId).find("input").val(0);
      }
    });
  }
  // Ngăn trang tự động cuộn khi focus vào input số lượng câu hỏi
  $(document).on(
    "focus",
    'input[type="number"], input[type="text"]',
    function (e) {
      const scrollTop = $(window).scrollTop();

      setTimeout(function () {
        $(window).scrollTop(scrollTop);
      }, 0);
    }
  );
  // Gắn sự kiện khi checkbox thay đổi
  $(document).on("change", ".dang-hoi", toggleSocauType);
  // $(document).on("change", ".dang-hoi", function () {
  //   toggleSocauType();
  //   $("#diem_tracnghiem, #diem_tuluan, #diem_dochieu").trigger("change");
  // });

  // Thay đoạn này (đã có rồi, chỉ sửa nhẹ)
  // ======== FIX CUỐI CÙNG: ẨN HOÀN TOÀN LỖI ĐIỂM KHI CHƯA SUBMIT ========
  $(document).on("change", ".dang-hoi", function () {
    const $this = $(this);
    const val = $this.val();
    let fieldId = "";

    if (val === "mcq" || val === "tracnghiem") fieldId = "#diem_tracnghiem";
    else if (val === "essay" || val === "tuluan") fieldId = "#diem_tuluan";
    else if (val === "reading" || val === "dochieu") fieldId = "#diem_dochieu";

    if ($this.is(":checked")) {
      // KHI TICK: hiện toast + focus + XÓA HẾT LỖI CŨ
      const currentVal = parseFloat($(fieldId).val().replace(",", ".")) || 0;
      if (currentVal <= 0) {
        showPointRequiredToast(
          val === "mcq" || val === "tracnghiem"
            ? "Trắc nghiệm"
            : val === "essay" || val === "tuluan"
            ? "Tự luận"
            : "Đọc hiểu"
        );
        setTimeout(() => $(fieldId).focus(), 100);
      }
    }

    // LUÔN LUÔN XÓA LỖI KHI THAY ĐỔI CHECKBOX (tick hoặc bỏ tick)
    $(fieldId).removeClass("is-invalid").siblings(".invalid-feedback").remove();
  });
  $(document).on("change", ".dang-hoi", function () {
    toggleSocauType();
    capNhatDiemMoiCau();

    // QUAN TRỌNG: Re-validate các ô điểm khi thay đổi loại
    $("#diem_tracnghiem, #diem_tuluan, #diem_dochieu").each(function () {
      $(this).valid(); // Kích hoạt lại rule required/min động
    });

    // Xóa lỗi cũ nếu bỏ tick
    if (!$(this).is(":checked")) {
      const map = {
        mcq: "#diem_tracnghiem",
        tracnghiem: "#diem_tracnghiem",
        essay: "#diem_tuluan",
        tuluan: "#diem_tuluan",
        reading: "#diem_dochieu",
        dochieu: "#diem_dochieu",
      };
      $(map[$(this).val()])
        .removeClass("is-invalid")
        .siblings(".invalid-feedback")
        .remove();
    }
  });

  // Trigger lại validate khi nhập điểm để hiện lỗi chỉ khi bấm nút
  $(document).on(
    "input",
    "#diem_tracnghiem, #diem_tuluan, #diem_dochieu",
    function () {
      if (isSubmitting) {
        $(".form-taodethi").valid();
      }
    }
  );
  toggleSocauType();

  function findIndexGroup(manhom) {
    let i = 0;
    let index = -1;
    while (i < groups.length && index == -1) {
      index = groups[i].nhom.findIndex((item) => item.manhom == manhom);
      if (index == -1) i++;
    }
    return i;
  }
  function showInfo(dethi) {
    const checkD = checkDate(dethi.thoigianbatdau);

    // --- Checkbox loại câu hỏi ---
    $("#loai-tracnghiem").prop(
      "checked",
      dethi.mcq_de + dethi.mcq_tb + dethi.mcq_kho > 0
    );
    $("#loai-tuluan").prop(
      "checked",
      dethi.essay_de + dethi.essay_tb + dethi.essay_kho > 0
    );
    $("#loai-doc-hieu").prop(
      "checked",
      dethi.reading_de + dethi.reading_tb + dethi.reading_kho > 0
    );

    // --- Số lượng câu hỏi từng loại ---
    $("#coban_tracnghiem").val(dethi.mcq_de);
    $("#trungbinh_tracnghiem").val(dethi.mcq_tb);
    $("#kho_tracnghiem").val(dethi.mcq_kho);

    $("#coban_tuluan").val(dethi.essay_de);
    $("#trungbinh_tuluan").val(dethi.essay_tb);
    $("#kho_tuluan").val(dethi.essay_kho);

    $("#coban_dochieu").val(dethi.reading_de);
    $("#trungbinh_dochieu").val(dethi.reading_tb);
    $("#kho_dochieu").val(dethi.reading_kho);

    // --- Điểm từng loại câu hỏi ---
    $("#diem_tracnghiem").val(dethi.diem_tracnghiem || 0);
    $("#diem_tuluan").val(dethi.diem_tuluan || 0);
    $("#diem_dochieu").val(dethi.diem_dochieu || 0);

    // --- Hiển thị div socau-type đúng ---
    toggleSocauType();

    // --- Các input khác ---
    $("#name-exam").val(dethi.tende);
    $("#exam-time").val(dethi.thoigianthi);

    $("#time-start").flatpickr({
      enableTime: true,
      altInput: true,
      allowInput: !checkD,
      defaultDate: dethi.thoigianbatdau,
    });

    $("#time-end").flatpickr({
      enableTime: true,
      altInput: true,
      allowInput: true,
      defaultDate: dethi.thoigianketthuc,
    });

    $("#tudongsoande")
      .prop("checked", dethi.loaide == "1")
      .prop("disabled", checkD);
    $("#xemdiem").prop("checked", dethi.xemdiemthi == "1");
    $("#xemda").prop("checked", dethi.xemdapan == "1");
    $("#xembailam").prop("checked", dethi.hienthibailam == "1");
    $("#daocauhoi").prop("checked", dethi.troncauhoi == "1");
    $("#daodapan").prop("checked", dethi.trondapan == "1");
    $("#tudongnop").prop("checked", dethi.nopbaichuyentab == "1");

    // --- Load nhóm học phần và chương ---
    $.when(showGroup(), showChapter(dethi.monthi)).done(function () {
      $("#nhom-hp").val(findIndexGroup(dethi.nhom[0])).trigger("change");
      setGroup(dethi.nhom, dethi.thoigianbatdau);

      if (dethi.loaide == "1") {
        $(".show-chap").show();

        if (Array.isArray(dethi.chuong)) {
          dethi.chuong.forEach(function (machuong) {
            $("#chuong input[type=checkbox][value='" + machuong + "']").prop(
              "checked",
              true
            );
          });
        }

        if (checkD) {
          $("#chuong-container")
            .find("input, select, textarea, button")
            .prop("disabled", true)
            .css({ "pointer-events": "none", opacity: "0.6" });
        }
      } else {
        $(".show-chap").hide();
      }
    });
  }

  function setGroup(list, date) {
    let v = checkDate(date);
    $("#select-all-group").prop("disabled", v);
    list.forEach((item) => {
      $(`.select-group-item[value='${item}']`)
        .prop("checked", true)
        .prop("disabled", v);
    });
  }

  function validUpdate() {
    let check = true;

    // 1. Kiểm tra tên đề
    if ($("#name-exam").val().trim() === "") {
      Dashmix.helpers("jq-notify", {
        type: "danger",
        icon: "fa fa-times me-1",
        message: "Tên đề không được để trống",
      });
      check = false;
    }

    // 2. Lấy thời gian từ form
    const startTimeStr = $("#time-start").val();
    const endTimeStr = $("#time-end").val();

    if (!startTimeStr || !endTimeStr) {
      Dashmix.helpers("jq-notify", {
        type: "danger",
        icon: "fa fa-times me-1",
        message: "Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc!",
      });
      return false;
    }

    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);

    // Kiểm tra hợp lệ ngày
    if (isNaN(startTime) || isNaN(endTime)) {
      Dashmix.helpers("jq-notify", {
        type: "danger",
        message: "Thời gian không hợp lệ!",
      });
      return false;
    }

    // 3. Thời gian kết thúc phải > thời gian bắt đầu
    if (endTime <= startTime) {
      Dashmix.helpers("jq-notify", {
        type: "danger",
        icon: "fa fa-times me-1",
        message: "Thời gian kết thúc phải lớn hơn thời gian bắt đầu!",
      });
      check = false;
    }

    // ================= CHỈ KIỂM TRA KHI ĐANG SỬA ĐỀ (infodethi tồn tại) =================
    if (typeof infodethi !== "undefined" && infodethi) {
      // 3.1. Không được giảm thời gian kết thúc so với cũ
      if (infodethi.thoigianketthuc) {
        const oldEndTime = new Date(infodethi.thoigianketthuc);
        if (endTime < oldEndTime) {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message:
              "Thời gian kết thúc không được nhỏ hơn thời gian kết thúc cũ!",
          });
          check = false;
        }
      }

      // 3.2. Thời gian làm bài phải >= thời gian thi cũ
      if (infodethi.thoigianthi) {
        const oldMinutes = parseInt(infodethi.thoigianthi) || 0;
        const newMinutes = getMinutesBetweenDates(startTime, endTime);

        if (newMinutes < oldMinutes) {
          Dashmix.helpers("jq-notify", {
            type: "danger",
            icon: "fa fa-times me-1",
            message: `Thời gian làm bài phải ít nhất ${oldMinutes} phút (như cũ)!`,
          });
          check = false;
        }
      }
    }
    // Nếu là tạo mới → bỏ qua 2 kiểm tra trên → không lỗi nữa

    return check;
  }
  showGroup();

  $("#btn-update-quesoftest").hide();
  // Khởi tạo biến đề thi để chứa thông tin đề
  let infodethi;
  function getDetail(made) {
    return $.ajax({
      type: "post",
      url: "/test/getDetail",
      data: {
        made: made,
      },
      dataType: "json",
      success: function (response) {
        if (response.loaide == 0) {
          $("#btn-update-quesoftest").show();
          $("#btn-update-quesoftest").attr(
            "href",
            `/test/select/${response.made}`
          );
        }
        console.log("Dữ liệu từ server:", response);
        console.log("Giá trị xembailam:", response.xembailam);
        infodethi = response;
        showInfo(response);
      },
    });
  }
});
