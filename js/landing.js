import { generalWhatsappUrl } from './shared/whatsapp.js';

// Menu do header (hambúrguer)
const menuButton = document.getElementById('menuBtn');
const menu = document.getElementById('siteMenu');
const setMenu = open => {
  menu.hidden = !open;
  menuButton.setAttribute('aria-expanded', open);
  menuButton.classList.toggle('open', open);
};
menuButton.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', event => { if (event.target.tagName === 'A') setMenu(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });

const whatsappLink = document.querySelector('[data-whatsapp-link]');
try {
  whatsappLink.href = generalWhatsappUrl();
} catch {
  whatsappLink.hidden = true;
}
