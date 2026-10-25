// Entry for js/vendor/swiper-14.3.0.custom.min.js (built by tools/build-swiper.mjs):
// Swiper core + only the modules the site uses, exposed as globals like the
// other vendor scripts.
import Swiper from 'swiper';
import { Navigation, Keyboard, A11y } from 'swiper/modules';

window.Swiper = Swiper;
window.SwiperModules = { Navigation, Keyboard, A11y };
