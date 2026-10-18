// @ts-check
const tabs = Array.from(document.querySelectorAll('[data-role-tab]')).filter(node => node instanceof HTMLButtonElement);
/** @param {HTMLButtonElement} tab */
function activate(tab) {
  tabs.forEach(item => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(item.getAttribute('aria-controls') || '');
    if (panel) panel.hidden = !selected;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activate(tab));
  tab.addEventListener('keydown', event => {
    let target = index;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = tabs.length - 1;
    else return;
    event.preventDefault(); activate(tabs[target]); tabs[target].focus();
  });
});
if (tabs[0]) activate(tabs[0]);
const tablist = document.querySelector('[data-role-tabs]');
if (tablist instanceof HTMLElement) tablist.hidden = false;
