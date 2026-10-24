// Presentation and accessibility only. Existing handlers continue to own data and actions.
(() => {
  const actionNames = { edit: 'Chỉnh sửa', pen: 'Chỉnh sửa', trash: 'Xóa', plus: 'Thêm mới', eye: 'Xem chi tiết', cog: 'Tùy chọn', search: 'Tìm kiếm', magnifier: 'Tìm kiếm', times: 'Đóng', close: 'Đóng', download: 'Tải xuống', copy: 'Sao chép', 'arrow-left': 'Quay lại' };
  function enhance() {
    document.querySelectorAll('a.skip-link[href^="#"]').forEach(link => {
      const hash = link.getAttribute('href');
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      const url = new URL(window.location.href);
      url.hash = hash;
      link.setAttribute('href', url.href);
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    });
    document.querySelectorAll('.col-sort').forEach(header => {
      header.tabIndex = 0;
      const order = header.getAttribute('data-sort-order');
      header.setAttribute('aria-sort', order === 'asc' ? 'ascending' : order === 'desc' ? 'descending' : 'none');
      header.setAttribute('aria-label', `Sắp xếp theo ${header.textContent.trim()}`);
    });
    document.querySelectorAll('button, a[href]').forEach(control => {
      if (control.hasAttribute('aria-label') || control.textContent.trim()) return;
      const icon = control.querySelector('i');
      const name = Object.entries(actionNames).find(([key]) => icon?.className.includes(key))?.[1];
      control.setAttribute('aria-label', control.getAttribute('title') || name || 'Thao tác');
    });
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(control => {
      if (control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby') || control.labels?.length) return;
      let label = control.getAttribute('placeholder');
      const cell = control.closest('td');
      if (cell && control.matches('[type="checkbox"]')) {
        const row = cell.parentElement;
        const column = Array.from(row.children).indexOf(cell);
        const table = cell.closest('table');
        label = `${row.children[0]?.textContent.trim()} — ${table?.querySelectorAll('thead th')[column]?.textContent.trim() || 'Chọn'}`;
      }
      if (!label) label = control.closest('.mb-3, .mb-4, .form-group')?.querySelector('label')?.textContent.trim();
      if (label) control.setAttribute('aria-label', label);
    });
    document.querySelectorAll('.nav-main-link.active').forEach(link => link.setAttribute('aria-current', 'page'));
    document.querySelectorAll('.pagination-container .page-link').forEach(link => {
      const disabled = link.disabled || link.classList.contains('disabled') || link.parentElement?.classList.contains('disabled');
      link.setAttribute('aria-disabled', String(disabled)); link.tabIndex = disabled ? -1 : 0;
      if (link.parentElement?.classList.contains('active')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('.table-responsive').forEach(region => {
      region.setAttribute('role', 'region');
      if (!region.hasAttribute('aria-label')) region.setAttribute('aria-label', 'Bảng dữ liệu, có thể cuộn ngang');
      region.tabIndex = 0;
    });
    document.querySelectorAll('canvas').forEach(canvas => {
      const chart = window.Chart?.getChart?.(canvas);
      if (!chart?.data?.labels || !chart.data.datasets?.[0]) return;
      const id = `${canvas.id || 'chart'}-description`;
      let description = document.getElementById(id);
      if (!description) { description = document.createElement('p'); description.id = id; description.className = 'visually-hidden'; canvas.after(description); }
      const text = chart.data.labels.map((label, index) => `${label}: ${chart.data.datasets[0].data[index]}`).join('; ');
      if (description.textContent !== text) description.textContent = text;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Phân bố điểm thi'); canvas.setAttribute('aria-describedby', id);
    });
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; enhance(); });
  }
  document.addEventListener('DOMContentLoaded', () => {
    enhance();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sort-order'] });
  });
  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.matches('.col-sort')) {
      event.preventDefault(); event.target.click();
    }
  });
  function prepareDropdown(event) {
    const toggle = event.target instanceof Element ? event.target.closest('[data-bs-toggle="dropdown"]') : null;
    if (toggle?.closest('.table-responsive') && window.bootstrap?.Dropdown) {
      bootstrap.Dropdown.getOrCreateInstance(toggle, { popperConfig: config => ({ ...config, strategy: 'fixed' }) });
    }
  }
  document.addEventListener('pointerdown', prepareDropdown, true);
  document.addEventListener('focusin', prepareDropdown);

  // Visible feedback for existing list reads; no request is added, retried or changed.
  const isListRead = settings => /\/(pagination|getTotalPages|loadData|loadDataGroups|getAllChapter|getAnnounce)(?:\?|$)/.test(settings.url);
  let pending = 0;
  let feedback;
  function getFeedback() {
    const main = document.getElementById('main-container');
    if (!main) return null;
    if (!feedback) { feedback = document.createElement('p'); feedback.className = 'ui-load-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true; main.prepend(feedback); }
    return feedback;
  }
  $(document).ajaxSend((_event, _xhr, settings) => {
    if (!isListRead(settings)) return;
    pending++;
    const element = getFeedback();
    if (element) { element.textContent = 'Đang tải dữ liệu…'; element.hidden = false; }
    document.getElementById('main-container')?.setAttribute('aria-busy', 'true');
  }).ajaxError((_event, xhr, settings) => {
    if (!isListRead(settings) || xhr.statusText === 'abort') return;
    const element = getFeedback();
    if (element) { element.textContent = 'Không tải được dữ liệu. Vui lòng thử lại thao tác hoặc tải lại trang.'; element.dataset.error = 'true'; element.hidden = false; }
  }).ajaxSuccess((_event, _xhr, settings) => {
    if (isListRead(settings) && feedback) delete feedback.dataset.error;
    schedule();
  }).ajaxComplete((_event, _xhr, settings) => {
    if (!isListRead(settings)) return;
    pending = Math.max(0, pending - 1);
    if (!pending) {
      document.getElementById('main-container')?.setAttribute('aria-busy', 'false');
      if (feedback && !feedback.dataset.error) feedback.hidden = true;
    }
  });
})();
