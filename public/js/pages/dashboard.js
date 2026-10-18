// Existing email onboarding; presentation no longer uses a stock-image carousel.
$(document).ready(function () {
  $.ajax({ type: "post", url: "/dashboard/checkEmail", success: function (response) {
    if (response == "") new bootstrap.Modal(document.getElementById("modal-onboarding")).show();
  }});
});

function validateEmail($email) {
  var emailReg = /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/;
  return emailReg.test($email);
}

function checkEmailExist(email) {
  $.ajax({
    type: "post",
    url: "/dashboard/checkEmailExist",
    data: {
      email: email,
    },
    success: function (response) {
      let check = response;
      if (check == 0) {
        updateEmail(email);
      } else {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: `Email đã tồn tài trong hệ thống!`,
        });
      }
    },
  });
}

function updateEmail(email) {
  $.ajax({
    type: "post",
    url: "/dashboard/updateEmail",
    data: {
      email: email,
    },
    success: function (response) {
      if (response) {
        Dashmix.helpers("jq-notify", {
          type: "success",
          icon: "fa fa-times me-1",
          message: `Cập nhật email thành công!!`,
        });
        $("#modal-onboarding").modal("hide");
      } else {
        Dashmix.helpers("jq-notify", {
          type: "danger",
          icon: "fa fa-times me-1",
          message: `Cập nhật email không thành công`,
        });
      }
    },
  });
}

$("#btn-email").click(function () {
  let email = $("#email").val();
  if (email == "") {
    Dashmix.helpers("jq-notify", {
      type: "danger",
      icon: "fa fa-times me-1",
      message: `Vui lòng không để trống email!`,
    });
  } else if (validateEmail(email)) {
    checkEmailExist(email);
  } else {
    Dashmix.helpers("jq-notify", {
      type: "danger",
      icon: "fa fa-times me-1",
      message: `Vui lòng điền đúng định dạng email`,
    });
  }
});
