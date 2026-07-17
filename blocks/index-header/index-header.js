/**
 * Mobile burger menu toggle
 */
document.querySelector('.index-header__burger')?.addEventListener('click', function() {
    this.nextElementSibling.classList.toggle('index-header__mobile-nav_open');
});
