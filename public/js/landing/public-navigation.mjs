// @ts-check
const menu = document.querySelector('.public-mobile-menu');
if (menu instanceof HTMLDetailsElement) {
  menu.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a')) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
}
